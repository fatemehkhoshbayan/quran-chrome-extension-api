import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { QuranModule } from './quran/quran.module';
import { TafsirModule } from './tafsir-ai/tafsir-ai.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), QuranModule, TafsirModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
