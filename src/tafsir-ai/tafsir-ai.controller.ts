import { Controller, Post, Body } from '@nestjs/common';
import { TafsirService } from './tafsir-ai.service';

@Controller('tafsir')
export class TafsirController {
  constructor(private readonly tafsirService: TafsirService) {}

  @Post()
  async getTafsir(
    @Body()
    body: {
      chapter_name: string;
      verseKey: string;
      text: string;
      tafsirHtml: string;
      question: string;
    },
  ) {
    return this.tafsirService.getExplanation(
      body.chapter_name,
      body.verseKey,
      body.text,
      body.tafsirHtml,
      body.question,
    );
  }
}
