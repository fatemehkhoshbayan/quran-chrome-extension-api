import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Headers,
  Res,
  UnauthorizedException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { QfOAuthService } from './qf-oauth.service';
import type { ISessionStore } from './session.store';
import { SESSION_STORE } from './session-store.factory';

@Controller('auth/quran')
export class AuthController {
  constructor(
    private readonly oauthService: QfOAuthService,
    private readonly config: ConfigService,
    @Inject(SESSION_STORE) private readonly store: ISessionStore,
  ) {}

  private validateSecret(secret?: string): void {
    if (secret !== this.config.get<string>('EXTENSION_SECRET')) {
      throw new UnauthorizedException();
    }
  }

  /**
   * Extension opens this URL in a new tab.
   * extState is a random opaque value the extension generated and stored locally.
   * The backend redirects the user's browser to the QF login page.
   */
  @Get('login')
  async login(
    @Query('state') extState: string,
    @Headers('extension_secret') headerSecret: string,
    @Query('extension_secret') querySecret: string,
    @Res() res: Response,
  ): Promise<void> {
    // Browser tab navigations cannot send custom headers, so the extension
    // passes the secret as a query param for this one redirect endpoint.
    this.validateSecret(headerSecret ?? querySecret);
    if (!extState) throw new BadRequestException('state query param required');

    const url = await this.oauthService.buildAuthorizeUrl(extState);
    console.info('[QF Auth] Redirecting to OAuth provider', {
      extState: this.shortId(extState),
      diagnostics: this.oauthService.getDiagnostics(),
    });
    res.redirect(302, url);
  }

  /**
   * QF redirects back here after user authenticates.
   * Backend exchanges the code, stores the session, then renders a self-closing page.
   * The extState is embedded in the QF `state` param as `<oauthState>.<extState>`.
   * We encode both values in the state we sent to QF so we can recover extState here.
   */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') rawState: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!code || !rawState) {
      res.status(400).send('Missing code or state');
      return;
    }

    // state format: "<oauthState>.<extState>" (dot-separated, extState is hex so no dots)
    const dotIdx = rawState.indexOf('.');
    if (dotIdx === -1) {
      res.status(400).send('Malformed state');
      return;
    }
    const oauthState = rawState.slice(0, dotIdx);
    const extState = rawState.slice(dotIdx + 1);

    try {
      console.info('[QF Auth] OAuth callback received', {
        extState: this.shortId(extState),
        oauthState: this.shortId(oauthState),
      });
      const tokens = await this.oauthService.exchangeCode(code, oauthState, extState);
      const sessionId = crypto.randomBytes(32).toString('hex');
      const session = {
        sub: tokens.sub,
        firstName: tokens.firstName,
        lastName: tokens.lastName,
        email: tokens.email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      };

      await this.store.setSession(sessionId, session);

      await this.store.setExtStateToSession(extState, sessionId, session);

      console.info('[QF Auth] Session stored after OAuth callback', {
        extState: this.shortId(extState),
        sessionId: this.shortId(sessionId),
        hasSub: Boolean(tokens.sub),
        hasRefreshToken: Boolean(tokens.refreshToken),
      });

      res.setHeader('Content-Type', 'text/html');
      res.send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Login successful</title></head>
<body style="font-family:sans-serif;text-align:center;padding:40px">
  <p style="font-size:1.2rem">&#10003; Logged in successfully. You can close this tab.</p>
  <script>
    try { window.close(); } catch(e) {}
    setTimeout(() => { document.body.innerHTML += '<p>This tab can be closed.</p>'; }, 1000);
  </script>
</body>
</html>`);
    } catch (err) {
      console.error('OAuth callback error:', err);
      res.status(500).send('Login failed. Please try again.');
    }
  }

  /**
   * Extension polls this endpoint after opening the login tab.
   * Returns { sessionToken, user } once login completes, 404 until then.
   * One-shot: the extState->sessionId mapping is deleted on first successful read.
   */
  @Get('session/:extState')
  async getSession(
    @Param('extState') extState: string,
    @Headers('extension_secret') secret: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.validateSecret(secret);

    const pickup = await this.store.consumeExtStateToSession(extState);
    res.setHeader('Cache-Control', 'no-store');
    if (!pickup) {
      res.status(202);
      res.setHeader('Retry-After', '3');
      console.info('[QF Auth] Session poll pending', {
        extState: this.shortId(extState),
      });
      return { status: 'pending', retryAfterMs: 3000 };
    }

    const { sessionId, session } = pickup;
    console.info('[QF Auth] Session poll completed', {
      extState: this.shortId(extState),
      sessionId: this.shortId(sessionId),
      hasSub: Boolean(session.sub),
    });

    return {
      sessionToken: sessionId,
      user: {
        sub: session.sub,
        first_name: session.firstName,
        last_name: session.lastName,
        email: session.email,
      },
    };
  }

  /**
   * Returns the authenticated user's profile given a valid session token.
   */
  @Get('me')
  async me(@Headers('extension_secret') secret: string, @Headers('x-session-token') sessionToken: string) {
    this.validateSecret(secret);
    if (!sessionToken) throw new UnauthorizedException('x-session-token header required');

    const session = await this.store.getSession(sessionToken);
    if (!session) throw new UnauthorizedException('Invalid or expired session');

    return {
      user: {
        sub: session.sub,
        first_name: session.firstName,
        last_name: session.lastName,
        email: session.email,
      },
    };
  }

  /**
   * Deletes the session (logout).
   */
  @Post('logout')
  async logout(
    @Headers('extension_secret') secret: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    this.validateSecret(secret);
    if (sessionToken) {
      await this.store.delSession(sessionToken);
    }
    return { success: true };
  }

  private shortId(value: string): string {
    return value ? `${value.slice(0, 8)}…` : '<missing>';
  }
}
