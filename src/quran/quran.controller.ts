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
    if (secret !== this.config.get('EXTENSION_SECRET')) {
      throw new UnauthorizedException();
    }
  }

  @Get('random-verse')
  randomVerse(@Headers('extension_secret') secret: string) {
    this.validate(secret);
    return this.quran.getRandomVerse();
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

  @Get('verse/:key')
  verses(@Param('id') id: string, @Headers('extension_secret') secret: string) {
    this.validate(secret);
    return this.quran.getVersesByKey(Number(id));
  }
}
