import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import type { Application } from 'express';

let cachedApp: Application | null = null;

function setupApp(app: INestApplication) {
  const config = app.get(ConfigService);
  const extensionId = config.get<string>('EXTENSION_ID');

  app.enableCors({
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, allowedOrigin?: string) => void,
    ) => {
      const allowedOrigin = `chrome-extension://${extensionId}`;
      if (!origin || origin === allowedOrigin) {
        cb(null, allowedOrigin);
      } else {
        cb(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'extension-secret'],
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
  cachedApp(req, res);
};

// Run HTTP server locally; on Vercel the default export handles requests
if (!process.env.VERCEL) {
  void bootstrap();
}
