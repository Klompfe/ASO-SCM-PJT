import { SetMetadata } from '@nestjs/common';

export const AUDIT_LOG_KEY = 'auditLogOptions';

export interface AuditLogOptions {
  // 사람이 읽을 수 있는 대상 종류 이름(예: 'MasterStyle'). 필수.
  entityType: string;
  // table/pkColumn을 둘 다 지정하면 인터셉터가 처리 전 DB에서 해당 행을 조회해
  // beforeValue로 남긴다 — 라우트 파라미터 하나가 그 행의 pkColumn 값이라고 가정한다
  // (예: PATCH /master-styles/:styleNo → table:'master_style', pkColumn:'styleNo').
  // 대상을 하나로 특정할 수 없는 라우트(생성 전용 POST, 일괄 처리, 파라미터 없는
  // 싱글턴 설정 등)는 생략한다 — 그 경우 beforeValue는 null로 남는다.
  table?: string;
  pkColumn?: string;
}

// PR-151: 기존 @Roles()와 독립적으로 붙이는 감사 로그 메타데이터. AuditLogInterceptor가
// 이 메타데이터가 있는 라우트만 기록한다(전역으로 등록돼 있지만 메타데이터 없으면 조용히
// 통과) — 전체 API가 아니라 이미 MANAGER/ADMIN으로 제한된 15개 API에만 붙인다.
export const AuditLog = (options: AuditLogOptions) => SetMetadata(AUDIT_LOG_KEY, options);
