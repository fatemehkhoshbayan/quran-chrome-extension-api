import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { QuranModule } from './quran/quran.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), QuranModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
