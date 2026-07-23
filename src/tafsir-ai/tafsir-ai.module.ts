import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiRateLimitGuard } from './ai-rate-limit.guard';
import { TafsirService } from './tafsir-ai.service';
import { TafsirController } from './tafsir-ai.controller';

@Module({
  imports: [AuthModule],
  controllers: [TafsirController],
  providers: [TafsirService, AiRateLimitGuard],
})
export class TafsirModule {}
