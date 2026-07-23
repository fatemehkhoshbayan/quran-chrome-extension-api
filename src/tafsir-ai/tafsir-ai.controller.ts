import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Body,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { verifyExtensionSecret } from '../common/verify-secret';
import { AiRateLimitGuard } from './ai-rate-limit.guard';
import { TafsirService } from './tafsir-ai.service';

const MAX_QUESTION_LENGTH = 500;
const MAX_TEXT_LENGTH = 2_000;
const MAX_TAFSIR_HTML_LENGTH = 20_000;
const MAX_CHAPTER_NAME_LENGTH = 200;
const MAX_VERSE_KEY_LENGTH = 20;

@Controller('tafsir')
export class TafsirController {
  constructor(
    private readonly tafsirService: TafsirService,
    private readonly config: ConfigService,
  ) {}

  private validateSecret(secret?: string): void {
    const expected = this.config.get<string>('EXTENSION_SECRET');
    if (!verifyExtensionSecret(secret, expected)) {
      throw new UnauthorizedException();
    }
  }

  private truncate(value: string | undefined, maxLength: number): string {
    if (!value) {
      return '';
    }
    return value.trim().slice(0, maxLength);
  }

  @Post()
  @UseGuards(SessionAuthGuard, AiRateLimitGuard)
  async getTafsir(
    @Headers('extension_secret') secret: string,
    @Body()
    body: {
      chapter_name?: string;
      verseKey?: string;
      text?: string;
      tafsirHtml?: string;
      question?: string;
    },
  ) {
    this.validateSecret(secret);

    const question = this.truncate(body?.question, MAX_QUESTION_LENGTH);
    const text = this.truncate(body?.text, MAX_TEXT_LENGTH);

    if (!question || !text) {
      throw new BadRequestException('question and text are required');
    }

    const chapterName = this.truncate(body?.chapter_name, MAX_CHAPTER_NAME_LENGTH);
    const verseKey = this.truncate(body?.verseKey, MAX_VERSE_KEY_LENGTH);
    const tafsirHtml = this.truncate(body?.tafsirHtml, MAX_TAFSIR_HTML_LENGTH);

    return this.tafsirService.getExplanation(
      chapterName,
      verseKey,
      text,
      tafsirHtml,
      question,
    );
  }
}
