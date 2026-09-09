import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 전역 필터 및 인터셉터 적용
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // CORS 설정 — CORS_ORIGIN(콤마 구분)이 있으면 그 값을, 없으면 로컬 개발 기본값을 사용한다.
  // CORS_ORIGIN=*는 반드시 배열이 아닌 문자열 '*' 그대로 넘겨야 한다(PR-061에서 발견된 버그) —
  // ['*']처럼 배열로 넘기면 cors 패키지가 이를 와일드카드가 아니라 "Origin 헤더가 정확히
  // 문자열 '*'인 요청만 허용"으로 해석해, 실제 브라우저 요청(Origin: https://...)이 전부
  // 막혀 Access-Control-Allow-Origin 헤더 자체가 응답에서 빠진다.
  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  let origin: string | string[];
  if (!corsOrigin) {
    origin = [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:8080',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:8080',
    ];
  } else if (corsOrigin === '*') {
    origin = '*';
  } else {
    origin = corsOrigin.split(',').map((o) => o.trim());
  }
  app.enableCors({ origin, credentials: true });

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