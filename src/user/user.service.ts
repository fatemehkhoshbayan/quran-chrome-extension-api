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
/** Virtual Favorites collection used by Quran.com — no custom collection create needed. */
const DEFAULT_COLLECTION_ID = '__default__';

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

  /** GET /v1/collections/:id — returns collection + bookmarks (no /bookmarks suffix for GET). */
  private defaultCollectionUrl(): string {
    return `${this.oauthService.userApiBase}/v1/collections/${DEFAULT_COLLECTION_ID}`;
  }

  /** POST/DELETE /v1/collections/:id/bookmarks */
  private defaultCollectionBookmarksUrl(): string {
    return `${this.defaultCollectionUrl()}/bookmarks`;
  }

  private async fetchDefaultCollectionBookmarks(accessToken: string): Promise<Bookmark[]> {
    const url = this.defaultCollectionUrl();
    const params = { first: 20 };

    this.logger.log('Calling Quran Foundation get default collection bookmarks', {
      upstreamUrl: url,
      upstreamMethod: 'GET',
      params,
    });

    try {
      const response = await axios.get<QfCollectionItemsResponse>(url, {
        headers: this.headers(accessToken),
        params,
      });
      const bookmarks = response.data.data?.bookmarks ?? [];
      this.logger.log('Quran Foundation get default collection bookmarks succeeded', {
        upstreamStatus: response.status,
        totalBookmarks: bookmarks.length,
        sampleId: bookmarks[0]?.id ?? '<none>',
      });
      return bookmarks.map(bookmark => ({
        id: bookmark.id,
        key: bookmark.key,
        verseNumber: bookmark.verseNumber,
        isInDefaultCollection: bookmark.isInDefaultCollection,
      }));
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        this.logger.warn('Quran Foundation default collection returned 404; treating as empty list', {
          upstreamStatus: err.response.status,
          upstreamBody: err.response.data,
          upstreamUrl: err.config?.url,
          upstreamMethod: err.config?.method?.toUpperCase(),
          params,
        });
        return [];
      }
      this.handleError(err, 'getBookmarks');
    }
  }

  async getBookmarks(accessToken: string) {
    const bookmarks = await this.fetchDefaultCollectionBookmarks(accessToken);
    return { bookmarks };
  }

  async addBookmark(accessToken: string, key: number, verseNumber: number) {
    const body: BookmarkBody = {
      type: 'ayah',
      key,
      verseNumber,
      mushaf: QURAN_COM_MUSHAF_ID,
      mushafId: QURAN_COM_MUSHAF_ID,
    };
    const url = this.defaultCollectionBookmarksUrl();

    try {
      this.logger.log('Calling Quran Foundation add bookmark to default collection', {
        upstreamUrl: url,
        upstreamMethod: 'POST',
        body,
      });

      const addResponse = await axios.post(url, body, {
        headers: this.headers(accessToken),
      });
      this.logger.log('Quran Foundation add bookmark to default collection succeeded', {
        upstreamStatus: addResponse.status,
      });

      // POST response does not include the bookmark ID — fetch collection to resolve real QF UUID.
      const bookmarks = await this.fetchDefaultCollectionBookmarks(accessToken);
      const created = bookmarks.find(
        bookmark => bookmark.key === key && bookmark.verseNumber === verseNumber,
      );

      if (created) {
        this.logger.log('Resolved new bookmark real ID', {
          realId: created.id,
          key,
          verseNumber,
        });
        return created;
      }

      return { id: `${key}:${verseNumber}`, key, verseNumber };
    } catch (err) {
      this.handleError(err, 'addBookmark');
    }
  }

  /**
   * Resolve a bookmark ID to the real QF UUID within the default collection.
   * Synthetic IDs use "key:verseNumber"; real QF cuid IDs never contain ":".
   */
  private async resolveBookmarkId(accessToken: string, bookmarkId: string): Promise<string> {
    if (!bookmarkId.includes(':')) {
      return bookmarkId;
    }

    const parts = bookmarkId.split(':');
    const key = parseInt(parts[0], 10);
    const verseNumber = parseInt(parts[1], 10);
    if (isNaN(key) || isNaN(verseNumber)) {
      throw new HttpException(`Cannot parse bookmark id: ${bookmarkId}`, HttpStatus.BAD_REQUEST);
    }

    this.logger.log('Resolving synthetic bookmark ID via default collection lookup', {
      bookmarkId,
      key,
      verseNumber,
    });

    const bookmarks = await this.fetchDefaultCollectionBookmarks(accessToken);
    const found = bookmarks.find(b => b.key === key && b.verseNumber === verseNumber);

    if (!found?.id) {
      throw new HttpException(
        `Bookmark key=${key} verseNumber=${verseNumber} not found in default collection`,
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
    const resolvedId = await this.resolveBookmarkId(accessToken, bookmarkId);
    const url = `${this.defaultCollectionBookmarksUrl()}/${resolvedId}`;

    this.logger.log('Calling Quran Foundation delete bookmark from default collection', {
      upstreamUrl: url,
      upstreamMethod: 'DELETE',
      originalId: bookmarkId,
      resolvedId,
    });

    try {
      const response = await axios.delete(url, { headers: this.headers(accessToken) });
      this.logger.log('Quran Foundation delete bookmark succeeded', {
        upstreamStatus: response.status,
        resolvedId,
      });
      return response.data;
    } catch (err) {
      this.handleError(err, 'deleteBookmark');
    }
  }
}
