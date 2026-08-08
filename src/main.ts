import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 🔒 1. 전역 입력값 검증 파이프 (ValidationPipe) 보안 설정
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // DTO에 정의되지 않은 입력 필드는 자동으로 보안 제거
      forbidNonWhitelisted: true, // DTO에 없는 필드가 포함될 경우 400 Bad Request 에러 발생
      transform: true, // 요청 데이터를 DTO 객체 및 타입(number, boolean 등)으로 자동 변환
      disableErrorMessages: false, // 개발 환경에서는 에러 메시지 상세 표시
    }),
  );

  // 🌐 2. CORS 보안 설정 (필요 시 특정 도메인으로 제한 가능)
  app.enableCors();

  // 📄 3. Swagger 문서화 설정
  const config = new DocumentBuilder()
    .setTitle('Apparel SCM API')
    .setDescription('정식서비스 - 의류 SCM 백엔드 REST API 문서')
    .setVersion('1.0')
    .addTag('Users', '사용자 관리 API')
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(3000);
  console.log(`🚀 서버가 시작되었습니다: http://localhost:3000`);
  console.log(`📚 API 문서(Swagger): http://localhost:3000/api`);
}
bootstrap();