import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios from 'axios';
import { QfOAuthService } from '../auth/qf-oauth.service';

interface BookmarkBody {
  type: 'ayah';
  key: number;
  verseNumber: number;
  mushaf: number;
}

export interface Bookmark {
  id: string;
  key: number;
  verseNumber: number;
  isInDefaultCollection?: boolean;
}

const QURAN_COM_MUSHAF_ID = 4; // UthmaniHafs, matching the extension's text_uthmani verses.

interface QfBookmarksResponse {
  data?: Bookmark[];
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

  async getBookmarks(accessToken: string) {
    const url = `${this.oauthService.userApiBase}/v1/bookmarks`;
    const params = {
      type: 'ayah',
      mushafId: QURAN_COM_MUSHAF_ID,
    };

    this.logger.log('Calling Quran Foundation get bookmarks', {
      upstreamUrl: url,
      upstreamMethod: 'GET',
      params,
    });

    try {
      const response = await axios.get<QfBookmarksResponse>(
        url,
        {
          headers: this.headers(accessToken),
          params,
        },
      );
      this.logger.log('Quran Foundation get bookmarks succeeded', {
        upstreamStatus: response.status,
        totalBookmarks: response.data.data?.length ?? 0,
      });
      return {
        bookmarks: (response.data.data ?? []).filter(
          (bookmark) => bookmark.isInDefaultCollection,
        ),
      };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        this.logger.warn('Quran Foundation get bookmarks returned 404; treating as empty list', {
          upstreamStatus: err.response.status,
          upstreamBody: err.response.data,
          upstreamUrl: err.config?.url,
          upstreamMethod: err.config?.method?.toUpperCase(),
          params,
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
    };
    const url = `${this.oauthService.userApiBase}/v1/collections/__default__/bookmarks`;

    this.logger.log('Calling Quran Foundation add bookmark', {
      upstreamUrl: url,
      upstreamMethod: 'POST',
      body,
    });

    try {
      const response = await axios.post(url, body, { headers: this.headers(accessToken) });
      this.logger.log('Quran Foundation add bookmark succeeded', {
        upstreamStatus: response.status,
        body,
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
