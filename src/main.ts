import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import type { Application } from 'express';

let cachedApp: Application | null = null;

function parseExtensionIds(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function setupApp(app: INestApplication) {
  const config = app.get(ConfigService);
  const extensionIds = parseExtensionIds(config.get<string>('EXTENSION_ID'));
  const allowedOrigins = [
    ...extensionIds.map((id) => `chrome-extension://${id}`),
    ...parseAllowedOrigins(config.get<string>('EXTENSION_ORIGINS')),
  ];
  const firstAllowedOrigin = allowedOrigins[0];

  app.enableCors({
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, allowedOrigin?: string | boolean) => void,
    ) => {
      if (!origin) {
        cb(null, firstAllowedOrigin ?? false);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        cb(null, origin);
      } else {
        console.warn('[CORS] Rejected origin', {
          origin,
          allowedOrigins,
        });
        cb(null, false);
      }
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'extension_secret', 'Accept', 'x-session-token'],
    maxAge: 86400,
  });
}

// 1. For Local Development
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  setupApp(app);
  await app.listen(3000);
  console.log(`Server running on http://localhost:3000`);
}

// 2. For Vercel Serverless
export default async (
  req: Parameters<Application>[0],
  res: Parameters<Application>[1],
) => {
  if (!cachedApp) {
    const app = await NestFactory.create(AppModule, { cors: false });
    setupApp(app);
    await app.init();
    cachedApp = app.getHttpAdapter().getInstance() as Application;
  }
  // Vercel passes the full path in req.url, so NestJS can route correctly
  cachedApp(req, res);
};

// Run HTTP server locally; on Vercel the default export handles requests
if (!process.env.VERCEL) {
  void bootstrap();
}
