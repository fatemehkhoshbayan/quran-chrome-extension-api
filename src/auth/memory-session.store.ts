import {
  ISessionStore,
  PkceState,
  SessionData,
  SessionPickup,
} from './session.store';

interface Entry<T> {
  value: T;
  expiresAt: number;
}

/**
 * In-memory session store for local development only.
 * Not suitable for production (data lost on restart, not shared across instances).
 */
export class MemorySessionStore implements ISessionStore {
  private readonly pkce = new Map<string, Entry<PkceState>>();
  private readonly sessions = new Map<string, Entry<SessionData>>();
  private readonly extStateMap = new Map<string, Entry<SessionPickup>>();

  private set<T>(map: Map<string, Entry<T>>, key: string, value: T, ttlMs: number): void {
    map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  private get<T>(map: Map<string, Entry<T>>, key: string): T | null {
    const entry = map.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      map.delete(key);
      return null;
    }
    return entry.value;
  }

  async setPkceState(extState: string, data: PkceState): Promise<void> {
    this.set(this.pkce, `pkce:${extState}`, data, 10 * 60 * 1000);
  }

  async getPkceState(extState: string): Promise<PkceState | null> {
    return this.get(this.pkce, `pkce:${extState}`);
  }

  async delPkceState(extState: string): Promise<void> {
    this.pkce.delete(`pkce:${extState}`);
  }

  async setSession(sessionId: string, data: SessionData): Promise<void> {
    this.set(this.sessions, `session:${sessionId}`, data, 30 * 24 * 60 * 60 * 1000);
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    return this.get(this.sessions, `session:${sessionId}`);
  }

  async delSession(sessionId: string): Promise<void> {
    this.sessions.delete(`session:${sessionId}`);
  }

  async setExtStateToSession(
    extState: string,
    sessionId: string,
    session: SessionData,
  ): Promise<void> {
    this.set(
      this.extStateMap,
      `extstate:${extState}`,
      { sessionId, session },
      10 * 60 * 1000,
    );
  }

  async consumeExtStateToSession(extState: string): Promise<SessionPickup | null> {
    const key = `extstate:${extState}`;
    const pickup = this.get(this.extStateMap, key);
    if (pickup) this.extStateMap.delete(key);
    return pickup;
  }
}
