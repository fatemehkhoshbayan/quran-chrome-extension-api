import {
  Controller,
  Get,
  Param,
  Query,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { QuranService } from './quran.service';
import { ConfigService } from '@nestjs/config';
import { verifyExtensionSecret } from '../common/verify-secret';

@Controller('quran')
export class QuranController {
  constructor(
    private quran: QuranService,
    private config: ConfigService,
  ) {}

  private validate(secret?: string) {
    const expected = this.config.get<string>('EXTENSION_SECRET');
    if (!verifyExtensionSecret(secret, expected)) {
      throw new UnauthorizedException();
    }
  }

  private parseTranslationId(raw?: string): number | undefined {
    if (!raw) return undefined;
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  @Get('random-verse')
  randomVerse(
    @Headers('extension_secret') secret: string,
    @Query('translationId') translationId?: string,
  ) {
    this.validate(secret);
    return this.quran.getRandomVerse(this.parseTranslationId(translationId));
  }

  @Get('languages')
  languages(@Headers('extension_secret') secret: string) {
    this.validate(secret);
    return this.quran.getLanguages();
  }

  @Get('translations')
  translations(@Headers('extension_secret') secret: string) {
    this.validate(secret);
    return this.quran.getTranslations();
  }

  @Get('chapters')
  chapter(@Headers('extension_secret') secret: string) {
    this.validate(secret);
    return this.quran.getChapter();
  }

  @Get('tafsirs')
  tafsirs(@Headers('extension_secret') secret: string) {
    this.validate(secret);
    return this.quran.getTafsirResources();
  }

  @Get('tafsir/:key')
  tafsir(
    @Param('key') key: string,
    @Headers('extension_secret') secret: string,
  ) {
    this.validate(secret);
    return this.quran.getTafsirByVerseKey(key);
  }

  @Get('verses/:key')
  verses(
    @Param('key') key: string,
    @Headers('extension_secret') secret: string,
    @Query('translationId') translationId?: string,
  ) {
    this.validate(secret);
    return this.quran.getVersesByKey(key, this.parseTranslationId(translationId));
  }
}
