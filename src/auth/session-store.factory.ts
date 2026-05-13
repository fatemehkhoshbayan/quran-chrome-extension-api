import { ISessionStore } from './session.store';
import { RedisSessionStore } from './redis-session.store';
import { MemorySessionStore } from './memory-session.store';

export const SESSION_STORE = 'SESSION_STORE';

export function createSessionStore(): ISessionStore {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (url && token) {
    return new RedisSessionStore(url, token);
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in production. ' +
        'Create a free database at https://console.upstash.com',
    );
  }

  console.warn('[SessionStore] Upstash env not set — using in-memory store (dev only)');
  return new MemorySessionStore();
}
