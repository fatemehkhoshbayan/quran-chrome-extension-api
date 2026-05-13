import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Headers,
  Res,
  UnauthorizedException,
  NotFoundException,
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
    @Headers('extension_secret') secret: string,
    @Res() res: Response,
  ): Promise<void> {
    this.validateSecret(secret);
    if (!extState) throw new BadRequestException('state query param required');

    const url = await this.oauthService.buildAuthorizeUrl(extState);
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
      const tokens = await this.oauthService.exchangeCode(code, oauthState, extState);
      const sessionId = crypto.randomBytes(32).toString('hex');

      await this.store.setSession(sessionId, {
        sub: tokens.sub,
        firstName: tokens.firstName,
        lastName: tokens.lastName,
        email: tokens.email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      });

      await this.store.setExtStateToSession(extState, sessionId);

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
  ) {
    this.validateSecret(secret);

    const sessionId = await this.store.consumeExtStateToSession(extState);
    if (!sessionId) throw new NotFoundException('Session not ready');

    const session = await this.store.getSession(sessionId);
    if (!session) throw new NotFoundException('Session not found');

    return {
      sessionToken: sessionId,
      user: {
        sub: session.sub,
        firstName: session.firstName,
        lastName: session.lastName,
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
        firstName: session.firstName,
        lastName: session.lastName,
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
}
