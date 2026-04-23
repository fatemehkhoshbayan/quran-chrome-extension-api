import {
  Controller,
  Get,
  Param,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { QuranService } from './quran.service';
import { ConfigService } from '@nestjs/config';

@Controller('quran')
export class QuranController {
  constructor(
    private quran: QuranService,
    private config: ConfigService,
  ) {}

  private validate(secret?: string) {
    if (secret !== this.config.get('EXTENSION-SECRET')) {
      throw new UnauthorizedException();
    }
  }

  @Get('random-verse')
  randomVerse(@Headers('extension-secret') secret: string) {
    this.validate(secret);
    return this.quran.getRandomVerse();
  }

  @Get('translations')
  translations(@Headers('extension-secret') secret: string) {
    this.validate(secret);
    return this.quran.getTranslations();
  }

  @Get('chapters')
  chapter(@Headers('extension-secret') secret: string) {
    this.validate(secret);
    return this.quran.getChapter();
  }

  @Get('tafsirs')
  tafsirs(@Headers('extension-secret') secret: string) {
    this.validate(secret);
    return this.quran.getTafsirResources();
  }

  @Get('tafsir/:key')
  tafsir(
    @Param('key') key: string,
    @Headers('extension-secret') secret: string,
  ) {
    this.validate(secret);
    return this.quran.getTafsirByVerseKey(key);
  }

  @Get('verses/:key')
  verses(
    @Param('key') key: string,
    @Headers('extension-secret') secret: string,
  ) {
    this.validate(secret);
    return this.quran.getVersesByKey(key);
  }
}
