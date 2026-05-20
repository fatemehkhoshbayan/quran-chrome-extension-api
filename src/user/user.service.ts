import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios from 'axios';
import { QfOAuthService } from '../auth/qf-oauth.service';

interface BookmarkBody {
  type: 'ayah';
  key: number;
  verseNumber: number;
  mushaf: number;
  mushafId: number;
}

export interface Bookmark {
  id: string;
  key: number;
  verseNumber: number;
  isInDefaultCollection?: boolean;
}

const QURAN_COM_MUSHAF_ID = 4; // UthmaniHafs, matching the extension's text_uthmani verses.
const EXTENSION_COLLECTION_NAME = 'Daily Quran Extension';

interface Collection {
  id: string;
  name: string;
}

interface QfCollectionsResponse {
  data?: Collection[];
}

interface QfCollectionResponse {
  data?: Collection;
}

interface QfCollectionItemsResponse {
  data?: {
    bookmarks?: Bookmark[];
  };
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly oauthService: QfOAuthService) {}

  private headers(accessToken: string) {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-auth-token': accessToken,
      'x-client-id': this.oauthService.qfClientId,
    };
  }

  private handleError(err: unknown, context: string): never {
    if (axios.isAxiosError(err) && err.response) {
      const status = err.response.status as HttpStatus;
      const body = err.response.data as { message?: string } | undefined;
      this.logger.error(`Quran Foundation ${context} failed`, {
        upstreamStatus: status,
        upstreamBody: err.response.data,
        upstreamUrl: err.config?.url,
        upstreamMethod: err.config?.method?.toUpperCase(),
      });
      throw new HttpException(body?.message ?? `${context} failed`, status);
    }
    this.logger.error(`Unexpected ${context} failure`, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  private async getOrCreateExtensionCollection(accessToken: string): Promise<Collection> {
    const collectionsUrl = `${this.oauthService.userApiBase}/v1/collections`;

    this.logger.log('Calling Quran Foundation list collections', {
      upstreamUrl: collectionsUrl,
      upstreamMethod: 'GET',
      collectionName: EXTENSION_COLLECTION_NAME,
    });

    const collectionsResponse = await axios.get<QfCollectionsResponse>(
      collectionsUrl,
      { headers: this.headers(accessToken), params: { first: 20 } },
    );

    this.logger.log('Quran Foundation list collections raw response', {
      upstreamStatus: collectionsResponse.status,
      dataKeys: Object.keys(collectionsResponse.data ?? {}),
      isArray: Array.isArray(collectionsResponse.data.data),
      count: Array.isArray(collectionsResponse.data.data) ? collectionsResponse.data.data.length : 'n/a',
    });

    const collections: Collection[] = Array.isArray(collectionsResponse.data.data)
      ? collectionsResponse.data.data
      : [];

    const existing = collections.find(
      (collection) => collection.name === EXTENSION_COLLECTION_NAME,
    );

    if (existing) {
      this.logger.log('Quran Foundation extension collection found', {
        collectionId: existing.id,
      });
      return existing;
    }

    this.logger.log('Calling Quran Foundation create extension collection', {
      upstreamUrl: collectionsUrl,
      upstreamMethod: 'POST',
      body: { name: EXTENSION_COLLECTION_NAME },
    });

    const createResponse = await axios.post<QfCollectionResponse>(
      collectionsUrl,
      { name: EXTENSION_COLLECTION_NAME },
      { headers: this.headers(accessToken) },
    );

    if (!createResponse.data.data) {
      throw new HttpException('Quran Foundation did not return created collection', HttpStatus.BAD_GATEWAY);
    }

    this.logger.log('Quran Foundation extension collection created', {
      upstreamStatus: createResponse.status,
      collectionId: createResponse.data.data.id,
    });

    return createResponse.data.data;
  }

  async getBookmarks(accessToken: string) {
    const collection = await this.getOrCreateExtensionCollection(accessToken);
    const url = `${this.oauthService.userApiBase}/v1/collections/${collection.id}/bookmarks`;
    const params = {
      type: 'ayah',
      mushafId: QURAN_COM_MUSHAF_ID,
    };

    this.logger.log('Calling Quran Foundation get bookmarks', {
      upstreamUrl: url,
      upstreamMethod: 'GET',
      params,
      collectionId: collection.id,
    });

    try {
      const response = await axios.get<QfCollectionItemsResponse>(
        url,
        {
          headers: this.headers(accessToken),
          params,
        },
      );
      this.logger.log('Quran Foundation get bookmarks succeeded', {
        upstreamStatus: response.status,
        totalBookmarks: response.data.data?.bookmarks?.length ?? 0,
        collectionId: collection.id,
      });
      return {
        bookmarks: response.data.data?.bookmarks ?? [],
      };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        this.logger.warn('Quran Foundation get bookmarks returned 404; treating as empty list', {
          upstreamStatus: err.response.status,
          upstreamBody: err.response.data,
          upstreamUrl: err.config?.url,
          upstreamMethod: err.config?.method?.toUpperCase(),
          params,
          collectionId: collection.id,
        });
        return { bookmarks: [] };
      }
      this.handleError(err, 'getBookmarks');
    }
  }

  async addBookmark(
    accessToken: string,
    key: number,
    verseNumber: number,
  ) {
    const body: BookmarkBody = {
      type: 'ayah',
      key,
      verseNumber,
      mushaf: QURAN_COM_MUSHAF_ID,
      mushafId: QURAN_COM_MUSHAF_ID,
    };
    const collection = await this.getOrCreateExtensionCollection(accessToken);
    const collectionBookmarkUrl = `${this.oauthService.userApiBase}/v1/collections/${collection.id}/bookmarks`;

    try {
      this.logger.log('Calling Quran Foundation add bookmark to extension collection', {
        upstreamUrl: collectionBookmarkUrl,
        upstreamMethod: 'POST',
        body,
        collectionId: collection.id,
      });

      const collectionResponse = await axios.post(collectionBookmarkUrl, body, {
        headers: this.headers(accessToken),
      });
      this.logger.log('Quran Foundation add bookmark to extension collection succeeded', {
        upstreamStatus: collectionResponse.status,
        collectionId: collection.id,
      });

      return { id: `${key}:${verseNumber}`, key, verseNumber };
    } catch (err) {
      this.handleError(err, 'addBookmark');
    }
  }

  async deleteBookmark(accessToken: string, bookmarkId: string) {
    const url = `${this.oauthService.userApiBase}/v1/bookmarks/${bookmarkId}`;

    this.logger.log('Calling Quran Foundation delete bookmark', {
      upstreamUrl: url,
      upstreamMethod: 'DELETE',
      bookmarkId,
    });

    try {
      const response = await axios.delete(url, { headers: this.headers(accessToken) });
      this.logger.log('Quran Foundation delete bookmark succeeded', {
        upstreamStatus: response.status,
        bookmarkId,
      });
      return response.data;
    } catch (err) {
      this.handleError(err, 'deleteBookmark');
    }
  }
}
