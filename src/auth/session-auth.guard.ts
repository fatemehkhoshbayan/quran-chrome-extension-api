import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { ISessionStore, SessionData } from './session.store';
import { SESSION_STORE } from './session-store.factory';
import { QfOAuthService } from './qf-oauth.service';

const REFRESH_BUFFER_MS = 60_000; // refresh 60 s before expiry

export interface AuthenticatedRequest extends Request {
  sessionId: string;
  sessionData: SessionData;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    @Inject(SESSION_STORE) private readonly store: ISessionStore,
    private readonly oauthService: QfOAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const sessionToken = req.headers['x-session-token'] as string | undefined;

    if (!sessionToken) throw new UnauthorizedException('x-session-token header required');

    const session = await this.store.getSession(sessionToken);
    if (!session) {
      console.warn('[QF Auth] Session token not found', {
        sessionId: this.shortId(sessionToken),
      });
      throw new UnauthorizedException('Invalid or expired session');
    }

    // Proactively refresh QF access token if close to expiry
    if (Date.now() >= session.accessTokenExpiresAt - REFRESH_BUFFER_MS) {
      try {
        console.info('[QF Auth] Refreshing QF access token', {
          sessionId: this.shortId(sessionToken),
          expiresAt: new Date(session.accessTokenExpiresAt).toISOString(),
        });
        const refreshed = await this.oauthService.refreshAccessToken(session.refreshToken);
        const updated = { ...session, ...refreshed };
        await this.store.setSession(sessionToken, updated);
        req.sessionId = sessionToken;
        req.sessionData = updated;
      } catch (error) {
        console.warn('[QF Auth] QF access token refresh failed; using existing session if still valid', {
          sessionId: this.shortId(sessionToken),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Refresh failed — session is still usable if token hasn't expired yet
        req.sessionId = sessionToken;
        req.sessionData = session;
      }
    } else {
      req.sessionId = sessionToken;
      req.sessionData = session;
    }

    return true;
  }

  private shortId(value: string): string {
    return value ? `${value.slice(0, 8)}…` : '<missing>';
  }
}
