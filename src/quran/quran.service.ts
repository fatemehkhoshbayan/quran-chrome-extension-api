import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { ConfigService } from '@nestjs/config';
import { OAuthTokenResponse } from './interfaces/oauth.interface';
import { Verse } from './interfaces/verse.interface';
import { QURAN_CHAPTERS } from './constant';

const CREDENTIALS_ERROR =
  'Missing Quran Foundation API credentials. Request access: https://api-docs.quran.foundation/request-access';
const BUFFER_MS = 30_000; // Re-request token 30s before expiry (per docs)

@Injectable()
export class QuranService {
  private accessToken: string | null = null;
  private tokenExpiresAt: number | null = null;
  private tokenPending: Promise<string> | null = null;

  private readonly OAUTH_URL = 'https://prelive-oauth2.quran.foundation';
  private readonly CONTENT_BASE_URL =
    'https://apis-prelive.quran.foundation/content/api/v4';

  constructor(private config: ConfigService) {}

  // =====================
  // OAuth token (per api-docs.quran.foundation Quick Start)
  // =====================
  private async fetchAccessToken(): Promise<void> {
    const clientId = this.config.get<string>('CLIENT_ID');
    const clientSecret = this.config.get<string>('CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new Error(CREDENTIALS_ERROR);
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await axios.post<OAuthTokenResponse>(
      `${this.OAUTH_URL}/oauth2/token`,
      'grant_type=client_credentials&scope=content',
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    this.accessToken = response.data.access_token;
    this.tokenExpiresAt = Date.now() + response.data.expires_in * 1000;
  }

  private isTokenValid(): boolean {
    return (
      !!this.accessToken &&
      !!this.tokenExpiresAt &&
      Date.now() < this.tokenExpiresAt - BUFFER_MS
    );
  }

  private clearTokenCache(): void {
    this.accessToken = null;
    this.tokenExpiresAt = null;
    this.tokenPending = null;
  }

  private async getAccessToken(): Promise<string> {
    if (this.isTokenValid()) {
      return this.accessToken!;
    }
    // Stampede prevention: one in-flight token request
    if (this.tokenPending) {
      return this.tokenPending;
    }
    this.tokenPending = this.fetchAccessToken()
      .then(() => {
        if (!this.accessToken) throw new Error('Failed to obtain access token');
        return this.accessToken;
      })
      .finally(() => {
        this.tokenPending = null;
      });
    return this.tokenPending;
  }

  // =====================
  // Content API: must send x-auth-token + x-client-id (not Bearer)
  // =====================
  private async quranRequest<T>(config: AxiosRequestConfig): Promise<T> {
    const clientId = this.config.get<string>('CLIENT_ID');
    if (!clientId) {
      throw new Error(CREDENTIALS_ERROR);
    }

    const doRequest = async () => {
      const token = await this.getAccessToken();
      return axios<T>({
        ...config,
        baseURL: this.CONTENT_BASE_URL,
        headers: {
          Accept: 'application/json',
          'x-auth-token': token,
          'x-client-id': clientId,
          ...(config.headers as Record<string, string>),
        },
      });
    };

    try {
      const response = await doRequest();
      return response.data;
    } catch (err: unknown) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 401) {
        this.clearTokenCache();
        const response = await doRequest();
        return response.data;
      }

      if (axios.isAxiosError(err) && err.response) {
        const upstreamStatus = err.response.status;
        const body = err.response.data as { message?: string } | undefined;
        const message =
          body?.message ?? err.message ?? 'Upstream Quran API error';
        throw new HttpException(
          { message, upstreamStatus },
          upstreamStatus as HttpStatus,
        );
      }
      throw err;
    }
  }

  // =====================
  // v4 endpoints
  // =====================

  private attachChapterName(verse: Verse) {
    verse.chapter_name = QURAN_CHAPTERS[verse.chapter_id] ?? '';
  }

  async getRandomVerse(): Promise<{ verse: Verse }> {
    const response = await this.quranRequest<{ verse: Verse }>({
      url: '/verses/random',
      method: 'GET',
      params: {
        fields: 'text_uthmani,chapter_id',
        audio: '7',
        translations: '85',
        translation_fields: 'text,id,language_name',
      },
    });

    if (response?.verse) {
      this.attachChapterName(response.verse);
    }

    return response;
  }

  async getTranslations() {
    return this.quranRequest({
      url: '/resources/translations',
      method: 'GET',
    });
  }

  async getChapter() {
    const response = await this.quranRequest({
      url: `/chapters`,
      method: 'GET',
    });
    return response;
  }

  async getVersesByKey(verseKey: string): Promise<{ verse: Verse }> {
    const response = await this.quranRequest<{ verse: Verse }>({
      url: `/verses/by_key/${verseKey}`,
      method: 'GET',
      params: {
        fields: 'text_uthmani,chapter_id',
        audio: '7',
        translations: '85',
        translation_fields: 'text,id,language_name',
      },
    });

    if (response?.verse) {
      this.attachChapterName(response.verse);
    }

    return response;
  }
}
