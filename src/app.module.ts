import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
// import { QuranModule } from './quran/quran.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
})
export class AppModule {}
