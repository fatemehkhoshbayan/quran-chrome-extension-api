import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });

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

  await app.listen(3000);
  console.log(`Server running on http://localhost:3000`);
}

bootstrap();
