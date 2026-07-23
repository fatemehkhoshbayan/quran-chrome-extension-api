import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { ConfigService } from '@nestjs/config';
import { OAuthTokenResponse } from './interfaces/oauth.interface';
import { Verse, ITafsir } from './interfaces/verse.interface';
import { QURAN_CHAPTERS } from './constant';

const CREDENTIALS_ERROR =
  'Missing Quran Foundation API credentials. Request access: https://api-docs.quran.foundation/request-access';
const BUFFER_MS = 30_000; // Re-request token 30s before expiry (per docs)

const DEFAULT_TRANSLATION_ID = '85';
const LANGUAGES_CACHE_MS = 6 * 60 * 60 * 1000;

interface QfLanguage {
  id: number;
  name: string;
  native_name: string;
  iso_code: string;
  direction: string;
}

interface QfTranslationResource {
  id: number;
  name: string;
  author_name: string;
  language_name: string;
}

export interface LanguageOption {
  id: number;
  name: string;
  native_name: string;
  iso_code: string;
  direction: string;
  defaultTranslation: {
    id: number;
    name: string;
    author_name: string;
  };
}

@Injectable()
export class QuranService {
  private accessToken: string | null = null;
  private tokenExpiresAt: number | null = null;
  private tokenPending: Promise<string> | null = null;
  private languagesCache: { data: { languages: LanguageOption[] }; expiresAt: number } | null =
    null;

  // =====================
  // Local
  // =====================
  // private readonly OAUTH_URL = 'https://prelive-oauth2.quran.foundation';
  // private readonly CONTENT_BASE_URL =
  //   'https://apis-prelive.quran.foundation/content/api/v4';

  // =====================
  // Production
  // =====================
  private readonly OAUTH_URL = 'https://oauth2.quran.foundation';
  private readonly CONTENT_BASE_URL =
    'https://apis.quran.foundation/content/api/v4';

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

  async getTafsirResources() {
    return this.quranRequest({
      url: '/resources/tafsirs',
      method: 'GET',
    });
  }

  async getTafsirByVerseKey(verseKey: string) {
    return this.quranRequest<{ tafsir: ITafsir }>({
      url: `/tafsirs/169/by_ayah/${verseKey}`,
      method: 'GET',
    });
  }

  private async attachTafsir(verse: Verse) {
    const tafsir: { tafsir: ITafsir } = await this.getTafsirByVerseKey(
      verse.verse_key,
    );
    if (tafsir?.tafsir) {
      verse.tafsir = tafsir.tafsir;
    }
  }

  async getRandomVerse(translationId?: number): Promise<{ verse: Verse }> {
    const response = await this.quranRequest<{ verse: Verse }>({
      url: '/verses/random',
      method: 'GET',
      params: {
        fields: 'text_uthmani,chapter_id',
        audio: '7',
        translations: String(translationId ?? DEFAULT_TRANSLATION_ID),
        translation_fields: 'text,id,language_name,resource_name',
      },
    });

    if (response?.verse) {
      this.attachChapterName(response.verse);
      await this.attachTafsir(response.verse);
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

  async getLanguages(): Promise<{ languages: LanguageOption[] }> {
    if (this.languagesCache && Date.now() < this.languagesCache.expiresAt) {
      return this.languagesCache.data;
    }

    const [languagesResponse, translationsResponse] = await Promise.all([
      this.quranRequest<{ languages: QfLanguage[] }>({
        url: '/resources/languages',
        method: 'GET',
      }),
      this.quranRequest<{ translations: QfTranslationResource[] }>({
        url: '/resources/translations',
        method: 'GET',
      }),
    ]);

    const translationsByLanguage = new Map<string, QfTranslationResource>();
    for (const translation of translationsResponse.translations ?? []) {
      const key = translation.language_name.toLowerCase();
      if (!translationsByLanguage.has(key)) {
        translationsByLanguage.set(key, translation);
      }
    }

    const languages = (languagesResponse.languages ?? [])
      .map(language => {
        const translation =
          translationsByLanguage.get(language.name.toLowerCase()) ??
          translationsByLanguage.get(language.iso_code.toLowerCase());

        if (!translation) {
          return null;
        }

        return {
          id: language.id,
          name: language.name,
          native_name: language.native_name,
          iso_code: language.iso_code,
          direction: language.direction,
          defaultTranslation: {
            id: translation.id,
            name: translation.name,
            author_name: translation.author_name,
          },
        } satisfies LanguageOption;
      })
      .filter((language): language is LanguageOption => language !== null)
      .sort((a, b) => a.name.localeCompare(b.name));

    const data = { languages };
    this.languagesCache = { data, expiresAt: Date.now() + LANGUAGES_CACHE_MS };
    return data;
  }

  async getVersesByKey(
    verseKey: string,
    translationId?: number,
  ): Promise<{ verse: Verse }> {
    const response = await this.quranRequest<{ verse: Verse }>({
      url: `/verses/by_key/${verseKey}`,
      method: 'GET',
      params: {
        fields: 'text_uthmani,chapter_id',
        audio: '7',
        translations: String(translationId ?? DEFAULT_TRANSLATION_ID),
        translation_fields: 'text,id,language_name,resource_name',
      },
    });

    if (response?.verse) {
      this.attachChapterName(response.verse);
      await this.attachTafsir(response.verse);
    }

    return response;
  }
}
