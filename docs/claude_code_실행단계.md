# ASO-SCM-PJT — Claude Code 실행용 단계별 프롬프트

> 사용법: 각 STEP을 순서대로 Claude Code에 붙여넣어 실행하세요.
> 한 STEP이 끝나면 반드시 "검증 방법"을 실행해 통과를 확인한 뒤 다음 STEP으로 넘어가세요.
> 각 STEP은 별도 브랜치 + 별도 커밋으로 진행하는 것을 전제로 작성했습니다.

---

## STEP 0. 사전 준비 (최초 1회)

```
이 저장소(ASO-SCM-PJT)에서 지금부터 여러 단계의 리팩터링/버그수정 작업을 순서대로 진행할 거야.
먼저 아래를 확인하고 보고해줘:
1. 현재 브랜치와 git status
2. package.json의 test, test:e2e 스크립트가 로컬에서 정상 실행되는지 (npm install 포함)
3. GEMINI.md에 정의된 프로젝트 규칙을 다시 읽고, 앞으로의 모든 작업에서 그 규칙(타입 방어, QueryRunner 트랜잭션 패턴, 코드 전체 보존, Swagger 데코레이터 보존)을 반드시 지킬 것을 확인해줘.
4. 작업 시작 전 `git checkout -b fix/wo-bom-deduction` 브랜치를 새로 만들어줘.
```

**검증 방법**: `npm run test`와 `npm run test:e2e`가 현재 main 기준으로 몇 개 통과/실패하는지 baseline을 기록해둔다.

---

## STEP 0-B. [선행] 헌장 거버넌스 체계 정비 (문서만, 코드 변경 없음)

> 코드를 고치기 전에 먼저 실행합니다. 목적: ①헌장(CHARTER.md)은 "목표"로 고정하고,
> ②"지금 뭐가 안 되어 있는지"를 별도 문서(STATUS.md)로 분리하고,
> ③이상적 설계(RLS/AI 엔진 등)는 "미래 비전"으로 명확히 분리하고,
> ④앞으로 같은 회귀(핵심 로직이 조용히 삭제되는 것)가 재발하지 않도록 규칙을 코딩 가이드에 박아둡니다.

```
새 브랜치: git checkout main && git checkout -b docs/governance-setup

아래 세 가지 문서 작업을 순서대로 진행해줘. 코드는 전혀 건드리지 말고 문서만 작업해줘.

1. docs/STATUS.md 신규 생성
   docs/CHARTER.md의 "3. 모듈 간 비즈니스 관계 및 연계 규칙"에 나열된 각 조항을 행으로 하는 표를 만들어줘.
   각 행은 다음 컬럼을 가져야 해: 헌장 조항 | 상태(✅구현됨 / ⚠️부분구현 / ❌미구현) | 근거 코드 위치 | 최근 확인일 | 비고
   실제 코드(src/purchase-orders/purchase-orders.service.ts, src/work-orders/work-orders.service.ts,
   src/auth/guards/roles.guard.ts 등)를 다시 확인해서 상태를 정확하게 채워줘.
   문서 맨 위에 "이 문서는 매 스프린트(또는 매 STEP 완료 시) 갱신한다"는 안내 문구를 넣어줘.

2. docs/ARCHITECTURE.md 재구성
   현재 문서의 "5. 공급업체 및 물류 도메인 확장 모델 (Future Extensions)" 섹션과,
   src/modules/po, src/modules/ai-client, src/common/guards/rls-session.guard.ts 에 구현된
   멀티테넌시/AI파싱/하이브리드검색 관련 내용을 분석해서
   "Phase 1 (현재 구현 대상)"과 "Phase 2 (미래 비전, 착수 시점 미정)"로 문서를 명확히 2단 구성해줘.
   Phase 2 섹션 상단에 "이 섹션의 내용은 헌장(CHARTER.md)의 당장 이행 의무 대상이 아니다"라고 명시해줘.

3. GEMINI.md에 재발 방지 규칙 추가
   "## 5. 헌장 영향 변경 관리 (Charter Impact Control)" 섹션을 새로 추가하고 아래 내용을 넣어줘:
   - CHARTER.md 3번 섹션에 명시된 로직(PO 상태 전이→재고 반영, WO 완료→BOM 기반 재고 차감)을
     삭제/단순화/우회하는 커밋은 커밋 메시지에 반드시 "[CHARTER-IMPACT]" 태그와 사유를 포함해야 한다.
   - 위 로직에 영향을 주는 PR은 병합 전 docs/STATUS.md의 해당 행을 갱신해야 한다.
   - 테스트를 통과시키기 위한 목적으로 비즈니스 로직을 삭제하는 것은 금지하며,
     테스트가 실패하면 로직이 아니라 테스트 자체(또는 테스트가 검증하는 전제)를 먼저 의심한다.

작업 완료 후 세 파일의 diff를 요약해서 보여줘.
```

**검증 방법**: 사람이 `docs/STATUS.md`, `docs/ARCHITECTURE.md`, `GEMINI.md` 세 파일을 직접 읽고
"❌미구현" 표시가 실제 코드 상태와 일치하는지 확인. 확인 후 커밋:
```
git add -A && git commit -m "docs: 헌장 이행현황(STATUS.md) 및 Phase 구분 신설, 회귀방지 규칙 추가"
```

---

## STEP 1. [P0] 작업지시(WO) 완료 시 BOM 기반 재고 차감 로직 복원

```
git log 에서 커밋 6780422 ("feat: 작업 지시 완료 시 재고 연동 TypeORM 트랜잭션 구현 및 DTO 수정")의
src/work-orders/work-orders.service.ts 변경 내용을 `git show 6780422 -- src/work-orders/work-orders.service.ts`로 확인해줘.

그 로직을 참고해서 현재의 src/work-orders/work-orders.service.ts (updateStatus 메서드)에
아래 요구사항으로 BOM 기반 재고 연동을 복원해줘:

1. WorkOrder.status가 COMPLETED로 변경되는 경우에만 아래 트랜잭션 로직 수행
   - 이미 COMPLETED이거나 CANCELLED인 WorkOrder는 BadRequestException 발생 (상태 전이 유효성 검사)
2. this.dataSource.createQueryRunner()로 트랜잭션 시작
3. 완제품(itemId)의 BOM 목록을 parentItemId 기준으로 조회 (src/boms/entities/bom.entity.ts의 Bom 엔티티 사용)
4. 각 하위 원자재(childItemId)에 대해 소요량 = bom.quantity * workOrder.targetQuantity 계산
5. 각 원자재의 Inventory를 findOne(..., { lock: { mode: 'pessimistic_write' } })으로 조회
   - 재고가 없으면 NotFoundException
   - 재고가 소요량보다 부족하면 BadRequestException(어떤 품목이 얼마나 부족한지 메시지에 포함)
6. 검증 통과 시 모든 원자재 재고를 소요량만큼 차감
7. 완제품(itemId)의 Inventory.quantity를 targetQuantity만큼 가산 (없으면 새로 생성)
8. WorkOrder.status를 COMPLETED로 저장
9. 에러 발생 시 rollbackTransaction, 성공 시 commitTransaction, finally에서 release
10. GEMINI.md의 에러 처리 규칙(catch(err) 타입 캐스팅, NestJS 표준 예외 사용)을 그대로 따를 것
11. 기존 create/findAll/findOne/remove 메서드는 그대로 보존하고, 파일 전체를 생략 없이 완전하게 작성해줘.
12. Swagger 데코레이터가 컨트롤러 쪽에 있다면 건드리지 말고 그대로 둬.

작업 후 src/work-orders/work-orders.service.spec.ts에 다음 테스트 케이스를 추가해줘:
- BOM 소요량만큼 원자재 재고가 정확히 차감되는지
- 완제품 재고가 targetQuantity만큼 증가하는지
- 원자재 재고 부족 시 BadRequestException이 발생하고 재고가 변경되지 않은 채 롤백되는지
- 이미 COMPLETED인 WO를 다시 COMPLETED로 바꾸려 하면 예외가 발생하는지
```

**검증 방법**:
```
npm run test -- work-orders
npm run test:e2e
```
모두 통과하면 커밋:
```
git add -A && git commit -m "fix: WO 완료 시 BOM 기반 재고 차감/가산 트랜잭션 복원"
```

---

## STEP 2. [P0] 발주(PO) 입고 완료 시 재고 자동 반영 구현

```
새 브랜치를 만들어줘: git checkout main && git checkout -b fix/po-inventory-sync

src/purchase-orders/purchase-orders.service.ts 를 확인하고,
PurchaseOrder.status가 RECEIVED로 변경되는 상태 전이 처리 메서드에
아래 로직을 QueryRunner 트랜잭션으로 추가해줘:

1. 대상 PurchaseOrder가 이미 RECEIVED이거나 CANCELLED 상태라면 BadRequestException 발생 (중복 입고 방지)
2. 상태를 RECEIVED로 갱신
3. 해당 itemId의 Inventory를 조회
   - 없으면 새로 Inventory 행 생성 (quantity = PO.quantity)
   - 있으면 quantity += PO.quantity
4. src/inventories/inventories.service.ts의 stockIn()에서 쓰인 것과 동일한 트랜잭션/락 패턴(pessimistic_write, commit/rollback/release)을 재사용해줘.
5. 기존 취소(cancel) 로직과 다른 메서드들은 전부 그대로 보존하고, 파일 전체를 생략 없이 작성해줘.
6. GEMINI.md 에러 처리 규칙을 그대로 따를 것.

이후 src/purchase-orders/purchase-orders.service.spec.ts에 다음 케이스를 추가해줘:
- PENDING -> RECEIVED 전이 시 Inventory가 없던 품목은 새로 생성되고 quantity가 PO.quantity와 같은지
- 이미 Inventory가 있던 품목은 기존 수량에 PO.quantity가 더해지는지
- 이미 RECEIVED/CANCELLED인 PO를 다시 RECEIVED로 바꾸려 하면 예외가 발생하는지
```

**검증 방법**:
```
npm run test -- purchase-orders
npm run test:e2e
```
통과 후 커밋:
```
git add -A && git commit -m "feat: PO 입고 완료(RECEIVED) 시 Inventory 자동 반영 트랜잭션 구현"
```

---

## STEP 3. [P0] 인증 가드 누락 수정 + 전역 가드 전환

```
새 브랜치: git checkout main && git checkout -b fix/global-auth-guard

1. 먼저 src 전체에서 @Controller가 선언된 모든 파일을 찾아서, 각각 @UseGuards(JwtAuthGuard)가 있는지 없는지 표로 정리해서 보여줘.
   (지금까지 확인된 바로는 items.controller.ts에는 없고, purchase-orders/suppliers/work-orders/inventories에는 있음)

2. 그 다음 아래 방식으로 전역 가드 전환을 진행해줘:
   - src/app.module.ts의 providers 배열에 { provide: APP_GUARD, useClass: JwtAuthGuard } 를 등록해서
     모든 컨트롤러가 기본적으로 인증을 요구하도록 만들어줘.
   - 로그인/회원가입 등 인증이 필요 없는 라우트(AuthController)에는 @Public() 데코레이터가 이미 붙어있는지 확인하고, 없으면 추가해줘.
   - 각 컨트롤러 파일에 개별로 붙어있던 @UseGuards(JwtAuthGuard)는 중복이니 제거해도 되지만,
     제거했을 때 Swagger @ApiBearerAuth() 표시에 문제가 없는지 확인하고 필요하면 유지해줘.
   - src/auth/jwt-auth.guard.ts (최상위 버전, Reflector로 IS_PUBLIC_KEY를 확인하는 쪽)을 전역 가드로 사용해줘.
     src/auth/guards/jwt-auth.guard.ts (하위 폴더의 단순 버전)는 이번 기회에 삭제 대상 후보로 표시만 해두고 아직 지우지 마.

3. 변경 후 Swagger(/api) 문서에서 인증이 필요 없어야 할 엔드포인트(로그인/회원가입/헬스체크 등)가 실수로 잠기지 않았는지 확인해줘.
```

**검증 방법**:
```
npm run start:dev
```
후 Swagger(`/api`)에서 `/auth/login`은 토큰 없이 호출 가능, `/items`는 토큰 없으면 401이 나는지 수동 확인. 그다음:
```
npm run test:e2e
```
통과 후 커밋:
```
git add -A && git commit -m "fix: 전역 JwtAuthGuard 적용 및 items 컨트롤러 인증 누락 수정"
```

---

## STEP 4. [P1] `modules/po` (v2 설계) 채택 여부 — 분석 및 권고안 도출

> 이 단계는 즉시 코드를 바꾸지 않고, 먼저 Claude Code에게 "의사결정 자료"를 만들게 하는 단계입니다.

```
새 브랜치는 만들지 말고 현재 상태에서 분석만 해줘.

src/modules/po/ 와 src/modules/ai-client/ 폴더, 그리고 src/purchase-orders/ 폴더를 비교 분석해서
아래 내용을 docs/DECISION_PO_ARCHITECTURE.md 파일로 작성해줘:

1. 두 설계(v1: purchase-orders, v2: modules/po)의 기능 차이표
   (멀티테넌시, 상태머신 이력, AI 파싱 연동, 현재 API 스펙과의 호환성 등 기준으로)
2. v2로 전환할 경우 필요한 마이그레이션 작업 목록 (엔티티 변경, 프론트 API 연동 변경 포함)
3. v1을 유지하고 v2를 삭제할 경우의 손실 기능 목록
4. 두 설계를 병행 운영하려 할 때의 리스크
5. 너의 권고안 (근거 포함, 단 최종 결정은 팀이 내린다는 점을 명시)

이 문서는 실제 코드는 변경하지 않고 분석 문서만 생성하는 작업이야.
```

**검증 방법**: 사람이 `docs/DECISION_PO_ARCHITECTURE.md`를 읽고 팀 회의에서 A/B/C 중 결정.
결정 후 별도 STEP 4-1(전환) 또는 STEP 4-2(폐기)를 아래처럼 진행:

**(결정이 "폐기"인 경우)**
```
src/modules/po/, src/modules/ai-client/ 폴더를 삭제하고,
package.json에서 이 모듈들만 사용하던 의존성(axios 등 다른 곳에서도 쓰이는지 확인 후)이 있다면 정리해줘.
docs/ARCHITECTURE.md에서 관련 서술이 있다면 "폐기됨" 상태로 갱신해줘.
```

**(결정이 "전환"인 경우, 별도 세션에서 진행 권장)**
```
docs/DECISION_PO_ARCHITECTURE.md의 마이그레이션 작업 목록을 기반으로,
src/modules/po를 app.module.ts에 등록하고 기존 src/purchase-orders 사용처(프론트엔드 포함)를
새 API 스펙에 맞게 단계적으로 전환하는 계획을 세워줘. 코드 변경은 계획 승인 후 진행할게.
```

커밋:
```
git add -A && git commit -m "docs: PO 아키텍처(v1/v2) 결정 문서 작성 및 후속 조치"
```

---

## STEP 5. [P1] Shipments 백엔드 구현 (또는 프론트 임시 비활성화)

```
새 브랜치: git checkout main && git checkout -b feat/shipments-backend

frontend-app/src/api/shipments.service.ts 와 frontend-app/src/components/ShipmentsManager.tsx 를 확인해서
프론트엔드가 기대하는 API 스펙(엔드포인트, 요청/응답 필드)을 먼저 정리해줘.

그 다음 src/shipments/entities/shipment.entity.ts를 기반으로
ShipmentsModule, ShipmentsController, ShipmentsService를 새로 구현해줘:
1. GET /shipments - 목록 조회 (페이징 포함, 다른 모듈의 findAll 패턴과 통일)
2. POST /shipments - 생성
3. PATCH /shipments/:id/status - 상태 전이 (SHIPPING <-> DELIVERED), 유효하지 않은 전이는 BadRequestException
4. 다른 컨트롤러와 동일하게 JwtAuthGuard 적용, Swagger 데코레이터(@ApiTags, @ApiOperation, @ApiResponse) 작성
5. src/app.module.ts에 ShipmentsModule을 등록해줘.
6. 프론트엔드 shipments.service.ts가 기대하는 응답 형태와 실제 백엔드 응답이 일치하는지 다시 한번 대조하고, 불일치 시 백엔드를 프론트 기대값에 맞춰줘 (프론트는 이미 배포된 UI이므로 백엔드가 맞추는 게 우선).
```

**검증 방법**:
```
npm run test:e2e
```
프론트 연동 확인 (`cd frontend-app && npm run dev`)으로 Shipments 탭에서 목록 조회/등록이 되는지 수동 확인.
통과 후 커밋:
```
git add -A && git commit -m "feat: Shipments 모듈 백엔드 구현 및 프론트 연동"
```

---

## STEP 6. [P1] auth 모듈 중복 파일 정리

```
새 브랜치: git checkout main && git checkout -b chore/auth-cleanup

1. src/auth/jwt.strategy.ts 와 src/auth/strategies/jwt.strategy.ts 를 비교해줘.
2. src/auth/jwt-auth.guard.ts 와 src/auth/guards/jwt-auth.guard.ts 를 비교해줘.
3. 실제 auth.module.ts에서 어느 쪽을 사용 중인지 확인하고(현재는 최상위 파일 사용 중),
   사용되지 않는 쪽(strategies/, guards/ 하위 폴더 버전)을 삭제해줘.
   단, guards/jwt-auth.guard.ts가 STEP 3에서 전역 가드로 채택되었다면 반대로 최상위 파일을 삭제하고
   하위 폴더 버전을 정식 위치로 승격시켜줘. (STEP 3 결과에 맞춰 판단해줘)
4. 삭제로 인해 깨지는 import 경로가 있는지 전체 프로젝트에서 grep으로 확인하고 모두 수정해줘.
5. src/auth/decorators/roles.decorator.ts, src/auth/guards/roles.guard.ts, src/auth/decorators/get-user.decorator.ts가
   실제로 어디에서도 사용되지 않는 죽은 코드인지 다시 확인해줘.
   - 사용 계획이 없다면 삭제
   - 향후 역할 기반 권한 제어(RBAC)가 필요하다면, 최소 1곳(예: 관리자 전용 API)에 실제로 적용하는 예시를 만들어줘.
6. JWT_SECRET이 코드 여러 곳에 하드코딩된 백업값('secretKey', 'YOUR_SECRET_KEY')으로 흩어져 있는지 확인하고,
   .env의 JWT_SECRET 환경변수 하나로 통일해줘. .env.example 파일이 없다면 새로 만들어줘.
```

**검증 방법**:
```
npm run build
npm run test
npm run test:e2e
```
통과 후 커밋:
```
git add -A && git commit -m "chore: auth 모듈 중복 파일 정리 및 JWT 시크릿 환경변수 통일"
```

---

## STEP 7. [P2] 설계 문서 동기화

```
새 브랜치: git checkout main && git checkout -b docs/sync-with-code

지금까지 STEP 1~6에서 실제로 무엇이 바뀌었는지를 기준으로
docs/ARCHITECTURE.md, docs/02_MODULE_RELATIONS.md, docs/CHARTER.md를 다시 검토해서
실제 코드와 다른 서술이 있으면 전부 최신 상태로 갱신해줘.

각 핵심 기능 서술 옆에 다음 중 하나의 상태 태그를 붙여줘:
- [구현됨]
- [설계만 되어있고 미구현]
- [폐기됨]

또한 GEMINI.md에도 이번에 새로 확립된 컨벤션(전역 가드 사용 여부, PO 아키텍처 최종 결정 등)이 있다면 반영해줘.
```

**검증 방법**: 사람이 문서를 읽고 실제 코드와 일치하는지 리뷰.
```
git add -A && git commit -m "docs: 설계 문서를 실제 구현 상태와 동기화"
```

---

## STEP 8. [P2] 회귀 방지 E2E 테스트 보강

```
새 브랜치: git checkout main && git checkout -b test/e2e-regression-guards

test/app.e2e-spec.ts (또는 모듈별 e2e 파일을 새로 분리해서)에 다음 시나리오를 추가해줘:
1. PO 생성 -> RECEIVED 전이 -> 해당 품목 Inventory 수량이 정확히 증가했는지 확인
2. 이미 RECEIVED인 PO를 다시 RECEIVED로 전이 시도 -> 400 에러 확인
3. BOM이 걸린 완제품에 대해 WO 생성 -> 원자재 재고를 충분히 넣어둔 상태에서 COMPLETED 전이 -> 원자재 차감/완제품 가산 확인
4. 원자재 재고가 부족한 상태에서 WO를 COMPLETED로 전이 시도 -> 400 에러 확인 및 재고가 변경되지 않았는지 확인
5. 인증 토큰 없이 /items, /purchase-orders, /work-orders 호출 시 전부 401이 나는지 확인 (전역 가드 회귀 방지)

이 테스트들은 앞으로 이런 핵심 로직이 실수로 다시 삭제되는 것을 막기 위한 것이므로,
package.json의 test:e2e 스크립트로 CI에서 항상 실행되도록 해줘.
만약 .github/workflows 에 CI 설정이 없다면, npm test와 npm run test:e2e를 PR마다 실행하는
간단한 GitHub Actions 워크플로(.github/workflows/ci.yml)도 만들어줘.
```

**검증 방법**:
```
npm run test:e2e
```
전부 통과 확인 후 커밋:
```
git add -A && git commit -m "test: PO/WO 핵심 트랜잭션 회귀 방지용 e2e 테스트 및 CI 워크플로 추가"
```

---

## STEP 9. [P2] 프론트엔드 기능 커버리지 확대

```
새 브랜치: git checkout main && git checkout -b feat/frontend-po-suppliers

frontend-app/src/components/의 기존 컴포넌트(ItemsManager, WorkOrdersManager 등) 스타일과
frontend-app/src/api/의 기존 서비스 파일 패턴을 그대로 따라서:

1. frontend-app/src/api/purchaseOrders.service.ts, suppliers.service.ts 신규 작성
2. frontend-app/src/components/PurchaseOrdersManager.tsx, SuppliersManager.tsx 신규 작성
   (목록 조회 페이징/필터, 생성, 상태 변경 UI 포함, 기존 컴포넌트와 동일한 toast 에러 처리 패턴 사용)
3. App.tsx의 탭 목록에 Purchase Orders, Suppliers 탭 추가
4. Swagger 문서(/api)와 대조해서 실제 백엔드 응답 필드명과 프론트 타입 정의가 일치하는지 확인해줘.
```

**검증 방법**: `cd frontend-app && npm run dev`로 실행해 새 탭에서 CRUD가 정상 동작하는지 수동 확인 후,
```
git add -A && git commit -m "feat: PurchaseOrders/Suppliers 프론트엔드 화면 추가"
```

---

## 전체 흐름 요약

| STEP | 우선순위 | 브랜치명 | 비고 |
|---|---|---|---|
| 0 | - | (기존) | 사전 점검 |
| 0-B | 선행 | docs/governance-setup | STATUS.md 신설, ARCHITECTURE Phase 구분, 회귀방지 규칙 |
| 1 | P0 | fix/wo-bom-deduction | 재고 정합성 핵심 |
| 2 | P0 | fix/po-inventory-sync | 재고 정합성 핵심 |
| 3 | P0 | fix/global-auth-guard | 보안 |
| 4 | P1 | (분석 문서만) | 팀 의사결정 필요 |
| 5 | P1 | feat/shipments-backend | 프론트 연동 |
| 6 | P1 | chore/auth-cleanup | 코드 정리 |
| 7 | P2 | docs/sync-with-code | 문서 신뢰도 |
| 8 | P2 | test/e2e-regression-guards | 회귀 방지 |
| 9 | P2 | feat/frontend-po-suppliers | 사용성 |

각 STEP은 이전 STEP이 main에 머지된 뒤 시작하는 것을 권장합니다 (특히 STEP 3의 전역 가드 변경은 이후 모든 STEP의 컨트롤러 작업에 영향을 주므로 먼저 안정화하는 것이 좋습니다).
