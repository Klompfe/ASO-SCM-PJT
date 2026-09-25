import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditLogEntry } from './entities/audit-log.entity';
import { AuditLogInterceptor } from './audit-log.interceptor';

// PR-151: APP_INTERCEPTOR로 전역 등록하지만, 실제로 기록하는 라우트는 @AuditLog()
// 메타데이터가 붙은 곳뿐이다(audit-log.interceptor.ts 참고) — 이 모듈을 app.module.ts에
// 임포트하기만 하면 되고, 각 컨트롤러는 @AuditLog()만 붙이면 된다(별도 @UseInterceptors 불필요).
@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntry])],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
  ],
})
export class AuditLogModule {}
