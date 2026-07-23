import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ISessionStore,
  PkceState,
  SessionData,
  SessionPickup,
} from './session.store';

const PKCE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EXT_STATE_TTL_MS = 10 * 60 * 1000;

export class PostgresSessionStore implements ISessionStore {
  private readonly pendingExtStateCache = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  private expiresAtFromNow(ttlMs: number): Date {
    return new Date(Date.now() + ttlMs);
  }

  private async purgeExpired(table: 'pkce' | 'session' | 'extState'): Promise<void> {
    const now = new Date();
    if (table === 'pkce') {
      await this.prisma.pkceState.deleteMany({ where: { expiresAt: { lte: now } } });
      return;
    }
    if (table === 'session') {
      await this.prisma.session.deleteMany({ where: { expiresAt: { lte: now } } });
      return;
    }
    await this.prisma.extStateSession.deleteMany({ where: { expiresAt: { lte: now } } });
  }

  async setPkceState(extState: string, data: PkceState): Promise<void> {
    await this.purgeExpired('pkce');
    await this.prisma.pkceState.upsert({
      where: { extState },
      create: {
        extState,
        oauthState: data.oauthState,
        nonce: data.nonce,
        codeVerifier: data.codeVerifier,
        expiresAt: this.expiresAtFromNow(PKCE_TTL_MS),
      },
      update: {
        oauthState: data.oauthState,
        nonce: data.nonce,
        codeVerifier: data.codeVerifier,
        expiresAt: this.expiresAtFromNow(PKCE_TTL_MS),
      },
    });
  }

  async getPkceState(extState: string): Promise<PkceState | null> {
    await this.purgeExpired('pkce');
    const row = await this.prisma.pkceState.findFirst({
      where: { extState, expiresAt: { gt: new Date() } },
    });
    if (!row) return null;
    return {
      oauthState: row.oauthState,
      nonce: row.nonce,
      codeVerifier: row.codeVerifier,
    };
  }

  async delPkceState(extState: string): Promise<void> {
    await this.prisma.pkceState.deleteMany({ where: { extState } });
  }

  async setSession(sessionId: string, data: SessionData): Promise<void> {
    await this.purgeExpired('session');
    await this.prisma.session.upsert({
      where: { id: sessionId },
      create: {
        id: sessionId,
        sub: data.sub,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        accessTokenExpiresAt: BigInt(data.accessTokenExpiresAt),
        expiresAt: this.expiresAtFromNow(SESSION_TTL_MS),
      },
      update: {
        sub: data.sub,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        accessTokenExpiresAt: BigInt(data.accessTokenExpiresAt),
        expiresAt: this.expiresAtFromNow(SESSION_TTL_MS),
      },
    });
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    await this.purgeExpired('session');
    const row = await this.prisma.session.findFirst({
      where: { id: sessionId, expiresAt: { gt: new Date() } },
    });
    if (!row) return null;
    return {
      sub: row.sub,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      accessTokenExpiresAt: Number(row.accessTokenExpiresAt),
    };
  }

  async delSession(sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  async setExtStateToSession(
    extState: string,
    sessionId: string,
    session: SessionData,
  ): Promise<void> {
    this.pendingExtStateCache.delete(extState);
    await this.purgeExpired('extState');
    await this.prisma.extStateSession.upsert({
      where: { extState },
      create: {
        extState,
        sessionId,
        session: session as unknown as Prisma.InputJsonValue,
        expiresAt: this.expiresAtFromNow(EXT_STATE_TTL_MS),
      },
      update: {
        sessionId,
        session: session as unknown as Prisma.InputJsonValue,
        expiresAt: this.expiresAtFromNow(EXT_STATE_TTL_MS),
      },
    });
  }

  async consumeExtStateToSession(extState: string): Promise<SessionPickup | null> {
    const cachedMissUntil = this.pendingExtStateCache.get(extState);
    if (cachedMissUntil && cachedMissUntil > Date.now()) {
      return null;
    }

    await this.purgeExpired('extState');
    const row = await this.prisma.extStateSession.findFirst({
      where: { extState, expiresAt: { gt: new Date() } },
    });

    if (!row) {
      this.pendingExtStateCache.set(extState, Date.now() + 2_000);
      return null;
    }

    await this.prisma.extStateSession.deleteMany({ where: { extState } });

    const session = row.session as unknown as SessionData;
    return { sessionId: row.sessionId, session };
  }
}
