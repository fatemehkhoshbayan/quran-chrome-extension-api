import { Redis } from '@upstash/redis';
import {
  ISessionStore,
  PkceState,
  SessionData,
  SessionPickup,
} from './session.store';

const PKCE_TTL_S = 10 * 60; // 10 minutes
const SESSION_TTL_S = 30 * 24 * 60 * 60; // 30 days
const EXT_STATE_TTL_S = 10 * 60; // 10 minutes

export class RedisSessionStore implements ISessionStore {
  private readonly redis: Redis;
  private readonly pendingExtStateCache = new Map<string, number>();

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token });
  }

  async setPkceState(extState: string, data: PkceState): Promise<void> {
    await this.redis.set(`pkce:${extState}`, JSON.stringify(data), { ex: PKCE_TTL_S });
  }

  async getPkceState(extState: string): Promise<PkceState | null> {
    const raw = await this.redis.get<string>(`pkce:${extState}`);
    if (!raw) return null;
    return typeof raw === 'string' ? (JSON.parse(raw) as PkceState) : (raw as unknown as PkceState);
  }

  async delPkceState(extState: string): Promise<void> {
    await this.redis.del(`pkce:${extState}`);
  }

  async setSession(sessionId: string, data: SessionData): Promise<void> {
    await this.redis.set(`session:${sessionId}`, JSON.stringify(data), { ex: SESSION_TTL_S });
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    const raw = await this.redis.get<string>(`session:${sessionId}`);
    if (!raw) return null;
    return typeof raw === 'string' ? (JSON.parse(raw) as SessionData) : (raw as unknown as SessionData);
  }

  async delSession(sessionId: string): Promise<void> {
    await this.redis.del(`session:${sessionId}`);
  }

  async setExtStateToSession(
    extState: string,
    sessionId: string,
    session: SessionData,
  ): Promise<void> {
    this.pendingExtStateCache.delete(extState);
    await this.redis.set(
      `extstate:${extState}`,
      JSON.stringify({ sessionId, session }),
      { ex: EXT_STATE_TTL_S },
    );
  }

  async consumeExtStateToSession(extState: string): Promise<SessionPickup | null> {
    const cachedMissUntil = this.pendingExtStateCache.get(extState);
    if (cachedMissUntil && cachedMissUntil > Date.now()) {
      return null;
    }

    const key = `extstate:${extState}`;
    const raw = await this.redis.getdel<string | SessionPickup>(key);

    if (!raw) {
      this.pendingExtStateCache.set(extState, Date.now() + 2_000);
      return null;
    }

    if (typeof raw === 'string') {
      return JSON.parse(raw) as SessionPickup;
    }

    return raw;
  }
}
