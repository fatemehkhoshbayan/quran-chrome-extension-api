import { Controller, Post, Body } from '@nestjs/common';
import { TafsirService } from './tafsir-ai.service';

@Controller('tafsir')
export class TafsirController {
  constructor(private readonly tafsirService: TafsirService) {}

  @Post()
  async getTafsir(@Body() body: { verseKey: string; text: string }) {
    return this.tafsirService.getExplanation(body.verseKey, body.text);
  }
}