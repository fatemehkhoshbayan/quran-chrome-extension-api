import { Redis } from '@upstash/redis';
import { ISessionStore, PkceState, SessionData } from './session.store';

const PKCE_TTL_S = 10 * 60; // 10 minutes
const SESSION_TTL_S = 30 * 24 * 60 * 60; // 30 days
const EXT_STATE_TTL_S = 10 * 60; // 10 minutes

export class RedisSessionStore implements ISessionStore {
  private readonly redis: Redis;

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

  async setExtStateToSession(extState: string, sessionId: string): Promise<void> {
    await this.redis.set(`extstate:${extState}`, sessionId, { ex: EXT_STATE_TTL_S });
  }

  async getExtStateToSession(extState: string): Promise<string | null> {
    return this.redis.get<string>(`extstate:${extState}`);
  }

  async consumeExtStateToSession(extState: string): Promise<string | null> {
    const key = `extstate:${extState}`;
    const sessionId = await this.redis.get<string>(key);
    if (sessionId) await this.redis.del(key);
    return sessionId;
  }
}
