export interface PkceState {
  oauthState: string;
  nonce: string;
  codeVerifier: string;
}

export interface SessionData {
  sub: string;
  firstName: string;
  lastName: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  /** Unix timestamp ms when the QF access token expires */
  accessTokenExpiresAt: number;
}

export interface ISessionStore {
  /** Store PKCE state keyed by the extension-generated extState. TTL: 10 min. */
  setPkceState(extState: string, data: PkceState): Promise<void>;
  getPkceState(extState: string): Promise<PkceState | null>;
  delPkceState(extState: string): Promise<void>;

  /** Persist a user session. TTL: 30 days (matches QF refresh token lifetime). */
  setSession(sessionId: string, data: SessionData): Promise<void>;
  getSession(sessionId: string): Promise<SessionData | null>;
  delSession(sessionId: string): Promise<void>;

  /**
   * After the OAuth callback completes, map the extState -> sessionId so the
   * extension can poll and retrieve its session token. TTL: 10 min.
   */
  setExtStateToSession(extState: string, sessionId: string): Promise<void>;
  getExtStateToSession(extState: string): Promise<string | null>;
  /** One-shot consume: read then delete. */
  consumeExtStateToSession(extState: string): Promise<string | null>;
}
