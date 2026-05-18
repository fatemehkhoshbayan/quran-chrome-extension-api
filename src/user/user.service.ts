import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { QfOAuthService } from '../auth/qf-oauth.service';

interface BookmarkBody {
  type: 'ayah';
  key: number;
  verseNumber: number;
  group: string;
}

export interface Bookmark {
  id: string;
  key: number;
  verseNumber: number;
}

interface QfBookmarksResponse {
  data?: {
    bookmarks?: Bookmark[];
  };
}

@Injectable()
export class UserService {
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
      throw new HttpException(body?.message ?? `${context} failed`, status);
    }
    throw err;
  }

  async getBookmarks(accessToken: string) {
    try {
      const response = await axios.get<QfBookmarksResponse>(
        `${this.oauthService.userApiBase}/v1/collections/__default__/bookmarks`,
        { headers: this.headers(accessToken) },
      );
      return { bookmarks: response.data.data?.bookmarks ?? [] };
    } catch (err) {
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
      group: 'verses_6236',
    };

    try {
      await axios.post(
        `${this.oauthService.userApiBase}/v1/collections/__default__/bookmarks`,
        body,
        { headers: this.headers(accessToken) },
      );
      return { id: `${key}:${verseNumber}`, key, verseNumber };
    } catch (err) {
      this.handleError(err, 'addBookmark');
    }
  }

  async deleteBookmark(accessToken: string, bookmarkId: string) {
    try {
      const response = await axios.delete(
        `${this.oauthService.userApiBase}/v1/bookmarks/${bookmarkId}`,
        { headers: this.headers(accessToken) },
      );
      return response.data;
    } catch (err) {
      this.handleError(err, 'deleteBookmark');
    }
  }
}
