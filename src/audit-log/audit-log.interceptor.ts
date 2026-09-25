import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Observable, from } from 'rxjs';
import { concatMap, switchMap } from 'rxjs/operators';
import { AUDIT_LOG_KEY, type AuditLogOptions } from './audit-log.decorator';
import { AuditAction, AuditLogEntry } from './entities/audit-log.entity';

// PR-151: @AuditLog() 메타데이터가 붙은 라우트만 기록한다(app.module.ts에 전역
// 등록돼 있지만 메타데이터 없는 나머지 API는 그냥 통과 — RolesGuard/ReadOnlyGuard와
// 같은 "메타데이터 없으면 통과" 패턴). 감사 로그 저장은 응답을 내려보내기 전에
// await한다(fire-and-forget으로 하면 다음 요청과 겹쳐 SQLite 단일 writer에서
// "Transaction is not started yet" 같은 경합이 났다 — 실제로 e2e에서 재현됨). 저장
// 자체가 실패해도 예외를 삼키고 로그만 남기며 원래 응답은 그대로 내려보낸다.
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
    @InjectRepository(AuditLogEntry)
    private readonly auditLogRepository: Repository<AuditLogEntry>,
  ) {}

  private resolveAction(method: string): AuditAction {
    if (method === 'POST') return AuditAction.CREATE;
    if (method === 'DELETE') return AuditAction.DELETE;
    return AuditAction.UPDATE;
  }

  // 원본 행을 그대로 감사 로그에 남기면 비밀번호 해시 같은 민감 값까지 들어간다
  // (users 테이블 password 컬럼은 서비스 레이어의 select:false로만 막혀 있고, 여기서
  // 쓰는 raw SQL은 그 보호를 거치지 않는다) — 알려진 민감 키는 항상 제거한다.
  private static readonly SENSITIVE_KEYS = ['password'];
  private sanitize(row: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!row) return null;
    const clone = { ...row };
    for (const key of AuditLogInterceptor.SENSITIVE_KEYS) delete clone[key];
    return clone;
  }

  // table/pkColumn이 지정돼 있고 라우트 파라미터가 하나라도 있으면, 처리 전 상태를
  // 조회해둔다 — 테이블/컬럼명은 사용자 입력이 아니라 @AuditLog() 호출부에 하드코딩된
  // 값이라 SQL 인젝션 경로가 아니다(식별자 값만 파라미터 바인딩).
  private async fetchBefore(options: AuditLogOptions, entityId: string | null): Promise<unknown> {
    if (!options.table || !options.pkColumn || !entityId) return null;
    try {
      const rows = await this.dataSource.query(
        `SELECT * FROM "${options.table}" WHERE "${options.pkColumn}" = $1`,
        [entityId],
      );
      return this.sanitize(rows?.[0] ?? null);
    } catch (err) {
      this.logger.warn(`감사 로그: 변경 전 값 조회 실패(${options.entityType}/${entityId}) — ${(err as Error).message}`);
      return null;
    }
  }

  private async persist(
    options: AuditLogOptions,
    action: AuditAction,
    userId: number | null,
    ip: string | null,
    entityIdFromParams: string | null,
    beforeValue: unknown,
    responseBody: any,
  ): Promise<void> {
    const entityId = entityIdFromParams ?? (responseBody?.id ?? responseBody?.styleNo ?? null);
    const entry = this.auditLogRepository.create({
      userId,
      ip,
      entityType: options.entityType,
      entityId: entityId !== null && entityId !== undefined ? String(entityId) : null,
      action,
      beforeValue: beforeValue ?? null,
      // responseBody도 sanitize한다 — POST /users처럼 컨트롤러가 그대로 User 엔티티
      // (비밀번호 해시 포함 가능)를 반환하는 응답을 그대로 감사 로그에 남기지 않기
      // 위함(API 응답 자체의 민감정보 노출 여부와는 별개 문제).
      afterValue: (responseBody && typeof responseBody === 'object' ? this.sanitize(responseBody) : responseBody) ?? null,
    });
    try {
      await this.auditLogRepository.save(entry);
    } catch (err) {
      this.logger.error(`감사 로그 저장 실패(${options.entityType}) — ${(err as Error).message}`);
    }
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<AuditLogOptions | undefined>(AUDIT_LOG_KEY, context.getHandler());
    if (!options) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const action = this.resolveAction(request.method);
    const userId: number | null = request.user?.userId ?? null;
    const ip: string | null = request.ip ?? request.headers?.['x-forwarded-for'] ?? null;
    const paramValues = Object.values(request.params ?? {});
    const entityIdFromParams = paramValues.length > 0 ? String(paramValues[0]) : null;

    return from(this.fetchBefore(options, entityIdFromParams)).pipe(
      switchMap((beforeValue) =>
        next.handle().pipe(
          concatMap((responseBody: any) =>
            from(
              this.persist(options, action, userId, ip, entityIdFromParams, beforeValue, responseBody).then(
                () => responseBody,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
