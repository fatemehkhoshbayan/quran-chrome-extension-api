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

interface QfAddCollectionBookmarkResponse {
  data?: {
    id?: string;
    key?: number;
    verseNumber?: number;
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
      const bookmarks = response.data.data?.bookmarks ?? [];
      this.logger.log('Quran Foundation get bookmarks succeeded', {
        upstreamStatus: response.status,
        totalBookmarks: bookmarks.length,
        collectionId: collection.id,
        sampleId: bookmarks[0]?.id ?? '<none>',
      });
      return { bookmarks };
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

      const collectionResponse = await axios.post<QfAddCollectionBookmarkResponse>(
        collectionBookmarkUrl,
        body,
        { headers: this.headers(accessToken) },
      );
      const qfBookmarkId = collectionResponse.data?.data?.id;
      this.logger.log('Quran Foundation add bookmark to extension collection succeeded', {
        upstreamStatus: collectionResponse.status,
        collectionId: collection.id,
        qfBookmarkId,
      });

      // Use the real QF bookmark ID so the frontend can delete it later.
      return { id: qfBookmarkId ?? `${key}:${verseNumber}`, key, verseNumber };
    } catch (err) {
      this.handleError(err, 'addBookmark');
    }
  }

  /**
   * Resolve a bookmark ID to the real QF UUID within the given collection.
   *
   * Synthetic IDs have the form "key:verseNumber" (no hyphens). Real QF UUIDs
   * contain hyphens. When a synthetic ID is received we list the collection
   * and find the matching entry by key + verseNumber.
   *
   * Throws 404 if the bookmark cannot be found in the collection.
   */
  private async resolveBookmarkIdInCollection(
    accessToken: string,
    collection: Collection,
    bookmarkId: string,
  ): Promise<string> {
    // Already a real UUID — return immediately.
    if (bookmarkId.includes('-')) {
      return bookmarkId;
    }

    // Synthetic "key:verseNumber" format — resolve via collection list.
    const parts = bookmarkId.split(':');
    const key = parseInt(parts[0], 10);
    const verseNumber = parseInt(parts[1], 10);
    if (isNaN(key) || isNaN(verseNumber)) {
      throw new HttpException(`Cannot parse bookmark id: ${bookmarkId}`, HttpStatus.BAD_REQUEST);
    }

    this.logger.log('Resolving synthetic bookmark ID via collection lookup', {
      bookmarkId,
      key,
      verseNumber,
      collectionId: collection.id,
    });

    const listUrl = `${this.oauthService.userApiBase}/v1/collections/${collection.id}/bookmarks`;
    const listResp = await axios.get<QfCollectionItemsResponse>(listUrl, {
      headers: this.headers(accessToken),
      params: { first: 20 },
    });

    const found = listResp.data?.data?.bookmarks?.find(
      b => b.key === key && b.verseNumber === verseNumber,
    );

    if (!found?.id) {
      throw new HttpException(
        `Bookmark key=${key} verseNumber=${verseNumber} not found in collection`,
        HttpStatus.NOT_FOUND,
      );
    }

    this.logger.log('Resolved synthetic ID to real QF bookmark ID', {
      from: bookmarkId,
      to: found.id,
    });
    return found.id;
  }

  async deleteBookmark(accessToken: string, bookmarkId: string) {
    // Per QF docs, DELETE /v1/bookmarks/:id only removes *orphan* bookmarks.
    // For bookmarks inside a collection the correct endpoint is
    // DELETE /v1/collections/:collectionId/bookmarks/:bookmarkId.
    const collection = await this.getOrCreateExtensionCollection(accessToken);
    const resolvedId = await this.resolveBookmarkIdInCollection(accessToken, collection, bookmarkId);

    const url = `${this.oauthService.userApiBase}/v1/collections/${collection.id}/bookmarks/${resolvedId}`;

    this.logger.log('Calling Quran Foundation delete collection bookmark', {
      upstreamUrl: url,
      upstreamMethod: 'DELETE',
      originalId: bookmarkId,
      resolvedId,
      collectionId: collection.id,
    });

    try {
      const response = await axios.delete(url, { headers: this.headers(accessToken) });
      this.logger.log('Quran Foundation delete collection bookmark succeeded', {
        upstreamStatus: response.status,
        resolvedId,
        collectionId: collection.id,
      });
      return response.data;
    } catch (err) {
      this.handleError(err, 'deleteBookmark');
    }
  }
}
