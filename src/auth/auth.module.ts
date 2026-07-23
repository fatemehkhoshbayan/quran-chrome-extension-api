import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { QfOAuthService } from './qf-oauth.service';
import { SessionAuthGuard } from './session-auth.guard';
import { SESSION_STORE } from './session-store.factory';
import { createSessionStore } from './session-store.factory';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    QfOAuthService,
    SessionAuthGuard,
    {
      provide: SESSION_STORE,
      useFactory: (prisma: PrismaService) => createSessionStore(prisma),
      inject: [PrismaService],
    },
  ],
  exports: [QfOAuthService, SESSION_STORE, SessionAuthGuard],
})
export class AuthModule {}
