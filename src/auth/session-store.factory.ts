import { ISessionStore } from './session.store';
import { MemorySessionStore } from './memory-session.store';
import { PostgresSessionStore } from './postgres-session.store';
import type { PrismaService } from '../prisma/prisma.service';

export const SESSION_STORE = 'SESSION_STORE';

export function createSessionStore(prisma?: PrismaService): ISessionStore {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl && prisma) {
    return new PostgresSessionStore(prisma);
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'DATABASE_URL must be set in production. Create a Neon Postgres database and set DATABASE_URL.',
    );
  }

  console.warn('[SessionStore] DATABASE_URL not set — using in-memory store (dev only)');
  return new MemorySessionStore();
}
