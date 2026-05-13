import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { QfOAuthService } from './qf-oauth.service';
import { SESSION_STORE } from './session-store.factory';
import { createSessionStore } from './session-store.factory';

@Module({
  controllers: [AuthController],
  providers: [
    QfOAuthService,
    {
      provide: SESSION_STORE,
      useFactory: () => createSessionStore(),
    },
  ],
  exports: [QfOAuthService, SESSION_STORE],
})
export class AuthModule {}
