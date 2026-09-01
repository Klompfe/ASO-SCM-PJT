# ASO-SCM-PJT 긴급 작업목록 (Action Items)

> 분석 기준: GitHub `Klompfe/ASO-SCM-PJT` main 브랜치, 커밋 `4457b2e` 기준
> 정렬 기준: 비즈니스 정합성에 미치는 영향도 순 (P0 = 즉시 / P1 = 이번 스프린트 / P2 = 다음 스프린트)

---

## P0 — 즉시 조치 (데이터 정합성/보안 직결)

### [ ] 1. 작업지시(WO) 완료 시 BOM 기반 재고 차감 로직 복원
- **문제**: `6780422` 커밋에서 구현됐던 로직이 `1792632` 커밋("테스트 스펙 정상화")에서 통째로 삭제되어, 현재 `work-orders.service.ts`의 `updateStatus()`는 상태값만 바꿀 뿐 재고에 전혀 영향을 주지 않음.
- **영향**: 생산 완료 처리를 해도 원자재 재고가 줄지 않고 완제품 재고도 늘지 않음 → 재고 데이터가 실제와 계속 괴리됨.
- **해야 할 일**:
  - [ ] `6780422` 커밋의 diff를 참고해 QueryRunner 트랜잭션 로직 복원
  - [ ] BOM 조회(`parentItemId` 기준) → 소요량 계산(`bom.quantity * targetQuantity`) → 원자재 재고 검증/차감 → 완제품 재고 가산 순서로 구현
  - [ ] 재고 부족 시 `BadRequestException` + 롤백 확인
  - [ ] `work-orders.service.spec.ts`에 "재고 부족 시 롤백되는지", "정상 완료 시 원자재 차감·완제품 가산이 맞는지" 케이스 추가
- **참고 파일**: `src/work-orders/work-orders.service.ts`, `src/boms/entities/bom.entity.ts`(현재 미사용 모듈이지만 엔티티는 재사용 가능)

### [ ] 2. 발주(PO) 입고 완료 시 재고 자동 반영 로직 구현
- **문제**: `PurchaseOrder.status`가 `RECEIVED`로 바뀌어도 `Inventory.quantity`가 증가하지 않음 (문서에만 명시되어 있고 코드 없음).
- **영향**: 입고 처리를 해도 재고가 늘지 않아, 재고 담당자가 별도로 수동 `stockIn`을 또 호출해야 하는 이중 작업 발생 가능.
- **해야 할 일**:
  - [ ] `purchase-orders.service.ts`의 상태 변경(`updateStatus`/`updatePOStatus`) 로직에 QueryRunner 트랜잭션 추가
  - [ ] 이미 완료(`RECEIVED`)/취소(`CANCELLED`)된 건 중복 입고 방지 검증 (docs에 명시된 요구사항)
  - [ ] `Inventory`가 없는 품목이면 신규 생성, 있으면 `quantity += PO.quantity`
  - [ ] `inventories.service.ts`의 기존 `stockIn` 트랜잭션 패턴(비관적 락) 재사용 검토
- **참고 파일**: `src/purchase-orders/purchase-orders.service.ts`, `src/inventories/inventories.service.ts`

### [ ] 3. `items` 컨트롤러 인증 가드 누락 수정
- **문제**: `items.controller.ts`에만 `@UseGuards(JwtAuthGuard)`가 빠져 있어, 로그인 없이 품목 생성/수정/대량업로드 API 호출이 가능한 상태.
- **영향**: 인증되지 않은 사용자가 품목 데이터를 조작 가능한 보안 취약점.
- **해야 할 일**:
  - [ ] `purchase-orders.controller.ts` 등 다른 컨트롤러와 동일하게 `@UseGuards(JwtAuthGuard)` 추가
  - [ ] 전체 컨트롤러 목록을 다시 훑어서 가드 누락 여부 재점검 (`suppliers`, `work-orders`, `inventories`는 확인됨 → OK)
  - [ ] 가능하면 컨트롤러 단위 개별 적용 대신 `app.module.ts`에 `APP_GUARD`로 전역 등록 + `@Public()`으로 예외 처리하는 방식으로 전환 (문서에 이미 그렇게 되어 있다고 적혀 있으므로 실제로도 일치시키는 게 안전)

---

## P1 — 이번 스프린트 내 (설계 부채 정리)

### [ ] 4. `modules/po` (v2 설계) 채택 여부 결정
- **문제**: 멀티테넌시(RLS) + 상태머신 + AI 파싱/하이브리드 검색까지 갖춘 정교한 발주 모듈이 초기 커밋부터 존재하지만 한 번도 `app.module.ts`에 연결된 적 없음. 현재는 훨씬 단순한 `src/purchase-orders`가 실제로 쓰이는 중.
- **해야 할 일**:
  - [ ] 팀 논의: (A) v2로 완전 교체, (B) 현재 v1 유지하고 v2는 삭제, (C) 특정 기능(AI 파싱 등)만 v1에 이식 중 택1
  - [ ] AI 엔진(`AI_ENGINE_URL`) 연동이 실제 로드맵에 있는지 확인 — 없다면 `modules/ai-client`, `modules/po` 폴더 삭제하여 혼선 제거
  - [ ] 유지하기로 하면 `AppModule`에 등록하고 RLS 미들웨어가 실제 PostgreSQL 세션에서 동작하는지 통합 테스트 작성

### [ ] 5. Shipments(물류) 기능 백엔드-프론트 정합
- **문제**: 프론트엔드에 `ShipmentsManager` 탭과 API 호출 코드가 있으나 백엔드엔 엔티티만 있고 모듈/컨트롤러/서비스가 없음 → 실행 시 404 발생 예상.
- **해야 할 일**:
  - [ ] `ShipmentsModule`/`ShipmentsController`/`ShipmentsService` 신규 구현 (CRUD + 상태(`SHIPPING`/`DELIVERED`) 전이)
  - [ ] 또는, 아직 우선순위가 아니라면 프론트 탭을 임시로 "준비 중" 처리해 사용자 혼란 방지
  - [ ] `docs/ARCHITECTURE.md` 5.2절(물류 도메인) 기준으로 PO/완제품 출고와의 연계 규칙 구체화

### [ ] 6. `auth` 모듈 중복 파일 정리
- **문제**: `jwt.strategy.ts`/`strategies/jwt.strategy.ts`, `jwt-auth.guard.ts`/`guards/jwt-auth.guard.ts`가 공존. 실제로는 최상위 구버전만 사용 중이며 하위 폴더 버전은 죽은 코드(하드코딩된 시크릿 `'YOUR_SECRET_KEY'` 포함되어 있어 더 위험).
- **해야 할 일**:
  - [ ] `src/auth/strategies/`, `src/auth/guards/`(하위 폴더 버전) 삭제 또는 최상위 파일을 이 위치로 이전하고 import 경로 일괄 수정 중 택1
  - [ ] `roles.guard.ts` / `@Roles()` / `GetUser` 데코레이터 — 실제 사용 계획이 있는지 확인 후, 없으면 삭제하거나 있으면 최소 한 곳에 적용하여 죽은 코드 상태 해소
  - [ ] JWT 시크릿을 `.env`의 `JWT_SECRET`으로 완전히 통일 (하드코딩 백업값 `'secretKey'` 제거 검토)

---

## P2 — 다음 스프린트 (문서/품질 개선)

### [ ] 7. 설계 문서와 실제 코드 동기화
- [ ] `docs/02_MODULE_RELATIONS.md`, `docs/ARCHITECTURE.md`에 "현재 미구현" 상태 명시(위 P0-1, P0-2 항목이 해결되기 전까지)
- [ ] 문서에 "Status: 설계됨 / 구현됨 / 폐기됨" 같은 상태 태그 추가하여 향후 동일한 혼선 방지

### [ ] 8. 회귀 방지용 E2E 테스트 보강
- **문제**: 정확히 이런 종류의 회귀(핵심 로직이 테스트 통과를 위해 삭제됨)를 막을 수 있는 통합 테스트 부재.
- [ ] "PO RECEIVED → Inventory 증가" e2e 테스트 추가
- [ ] "WO COMPLETED → BOM 기반 원자재 차감/완제품 가산" e2e 테스트 추가
- [ ] "재고 부족 시 WO 완료 실패 + 롤백" e2e 테스트 추가
- [ ] CI에 e2e 테스트 필수 통과 조건으로 반영 (현재 CI 설정 확인 필요 — Actions 워크플로 파일 미확인됨)

### [ ] 9. 프론트엔드 기능 커버리지 확대
- [ ] 백엔드엔 있지만 프론트 화면이 없는 `purchase-orders`, `suppliers` 매니저 컴포넌트 추가
- [ ] API 명세(Swagger)와 프론트 `api/*.service.ts` 간 엔드포인트 매핑표 작성하여 불일치 사전 점검

---

## 요약 우선순위 체크리스트

| # | 항목 | 우선순위 | 예상 영향 범위 |
|---|---|---|---|
| 1 | WO 완료 시 BOM 재고 차감 복원 | P0 | 재고 정합성 |
| 2 | PO 입고 시 재고 자동 반영 구현 | P0 | 재고 정합성 |
| 3 | items 컨트롤러 인증 가드 추가 | P0 | 보안 |
| 4 | modules/po v2 채택 여부 결정 | P1 | 아키텍처 방향성 |
| 5 | Shipments 백엔드 구현/정리 | P1 | 프론트-백엔드 정합 |
| 6 | auth 중복 파일 정리 | P1 | 보안/유지보수성 |
| 7 | 문서-코드 동기화 | P2 | 문서 신뢰도 |
| 8 | 회귀 방지 E2E 테스트 | P2 | 품질 안정성 |
| 9 | 프론트 기능 커버리지 확대 | P2 | 사용성 |
