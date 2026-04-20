import { Module } from '@nestjs/common';
import { TafsirService } from './tafsir-ai.service';
import { TafsirController } from './tafsir-ai.controller';

@Module({
  controllers: [TafsirController],
  providers: [TafsirService],
})
export class TafsirModule {}
