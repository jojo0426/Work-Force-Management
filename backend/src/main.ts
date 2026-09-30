import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

function allowedOrigins(): string[] {
  const configured = process.env.CORS_ORIGINS
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured?.length) return configured;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGINS must be configured in production');
  }

  return ['http://localhost:3000', 'http://localhost:5173'];
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: allowedOrigins(),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  });
  await app.listen(process.env.PORT || 4000);
  console.log(`🔥 FiberBlaze WFM API running at http://localhost:${process.env.PORT || 4000}/api/v1`);
}
bootstrap();
