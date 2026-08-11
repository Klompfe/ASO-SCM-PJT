import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();

  // 가장 표준적인 BearerAuth 설정
  const config = new DocumentBuilder()
    .setTitle('Apparel SCM API')
    .setDescription('정식서비스 - 의류 SCM 백엔드 REST API 문서')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 서버가 시작되었습니다: http://localhost:${port}`);
  console.log(`📚 API 문서(Swagger): http://localhost:${port}/api`);
}

bootstrap();