import { Controller, Get, Header } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('privacy-policy')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=86400')
  privacyPolicy(): string {
    return this.appService.privacyPolicy();
  }

  @Get('terms')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=86400')
  terms(): string {
    return this.appService.terms();
  }
}
