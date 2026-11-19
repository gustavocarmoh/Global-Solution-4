import './env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Atrás do proxy do Docker/Nginx, usa X-Forwarded-For para auditoria e limite de requisições
  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
      : [
          'http://localhost:5173',
          'http://127.0.0.1:5173',
          'http://localhost:8081', // Expo Web
        ],
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Cidade em Foco — API Municipal')
    .setDescription(
      'Plataforma Integrada de Serviços Municipais, Zeladoria Urbana e Participação Cidadã (Lei nº 13.460/2017 e LGPD)',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.API_PORT || 3000);
  await app.listen(port);
  console.log(`[Cidade em Foco API] Rodando em http://localhost:${port}/api/v1`);
  console.log(`[Swagger Docs] Disponível em http://localhost:${port}/api/docs`);
}

bootstrap();
