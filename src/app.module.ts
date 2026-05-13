import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { QuranModule } from './quran/quran.module';
import { TafsirModule } from './tafsir-ai/tafsir-ai.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), QuranModule, TafsirModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
