# SCM 백엔드 시스템 아키텍처 (System Architecture)

> Status: 최종 검증 2026-09-04, PR-001~019 반영

본 문서는 **SCM 백엔드 API 서비스**의 아키텍처 원칙, 패키지 구성 구조, 엔티티 관계, 트랜잭션 관리 및 보안 설계를 기술합니다.

---

## 1. 아키텍처 설계 원칙 (Architectural Principles)
- **모듈화 및 단일 책임 원칙 (Modular & SRP)**: 각 도메인 영역(인증, 품목, 재고, 발주, 작업지시 등)은 자체 모듈, 서비스, 컨트롤러 및 엔티티를 가지며 고유의 책임에 집중합니다.
- **트랜잭션 ACID 보장 (Transactional ACID)**: 상태 변화가 유기적으로 연쇄 반응하는 SCM 도메인 특성상, 일관성(Consistency)과 격리성(Isolation)을 유지하기 위해 TypeORM `QueryRunner`를 사용한 명시적 트랜잭션을 적용합니다.
- **안전한 권한 제어 (Security)**: 전역 `JwtAuthGuard`를 통해 인증을 강제합니다. (RLS/멀티테넌시는 4절 참고 — v2 설계와 함께 제거됨)

---

## 2. 도메인 엔티티 관계 (Entity Relationship Diagram - Conceptual)

```
[ MasterStyle ] --1:N--> [ Bom ] --1:N--> [ BomItem ] --N:1--> [ Item ]
       ^                                                          |
       | styleNo (값 참조, 관계 아님)                                 |
       +----------------------------------------------------------+
                                     |
                    +----------------+----------------+
                    |                |                |
                    v *              v *              v *
             [ Inventory ]   [ PurchaseOrder ]   [ WorkOrder ]
          (itemId/quantity) (itemId/quantity)  (itemId/targetQuantity)
                                     |
                                     | N:1 (shipmentId, nullable)
                                     v
                              [ Shipment ]
```

### 2.1 엔티티 상세 설명
- **Item Entity**: 품목 마스터. `id`, `code`, `name`, `type`(완제품/반제품/원자재 등), `unit`, `spec`, `styleNo`(nullable — `FINISHED_GOOD` Item이 속한 `MasterStyle.styleNo`를 값으로만 참조) 관리.
- **Bom Entity / BomItem Entity**: `Bom`은 `style`로 `MasterStyle`을 참조하는 스타일 단위 자재명세서 헤더이며, `BomItem`은 그 하위 원자재 라인으로 `bom`(Bom 참조)과 `material`(원자재 Item 참조, `@ManyToOne`) + `consumption`(단위 소요량) + `requiredQty`를 가짐. `src/boms/`의 `BomsModule`이 두 엔티티를 전담 소유. 같은 style에 Bom이 중복 생성될 수 있는 알려진 이슈가 있어, 소비 측(WO 재고 차감)에서는 `id DESC` 최신 Bom만 사용.
- **Inventory Entity**: 실시간 창고 내 수량 정보. `itemId`로 Item 엔티티와 ManyToOne 관계를 맺음.
- **PurchaseOrder Entity**: 외부 조달 주문서. 발주 수량(`quantity`) 및 현재 상태(`status`) 관리. `shipmentId`(nullable)로 `Shipment`를 참조하며, PO 조회 시 관계에 포함되어 배송 정보가 함께 내려감.
- **WorkOrder Entity**: 사내 제조 생산 지시서. 목표 수량(`targetQuantity`) 및 생산 진행 상태(`status`) 관리.
- **Shipment Entity**: 출하 정보. `status`(`SHIPPING`|`DELIVERED`), `carrierName`, `trackingNumber`, `estimatedArrival` 관리. 5.2절 참고.

---

## 3. 핵심 비즈니스 연동 시나리오 (Core Business Scenarios)

### 3.1 발주 입고 완료 (PurchaseOrder RECEIVED)
- **트리거**: `PO.status`를 `RECEIVED`로 업데이트 요청.
- **수행 과정**:
  1. 트랜잭션 시작 (`QueryRunner`)
  2. 트랜잭션 내에서 PO를 재조회하고 기존 상태를 검증 (이미 `RECEIVED`이거나 `CANCELLED`인 경우 `BadRequestException`)
  3. 대상 품목(`itemId`)에 해당하는 `Inventory`를 조회.
     - `inventories.service.ts`의 `stockIn()`과 동일한 `pessimistic_write` 락을 사용하되, SQLite는 이 락을 지원하지 않아 `dataSource.options.type !== 'sqlite'`일 때만 락을 적용(Postgres 프로덕션 기준 정상 동작, 로컬 SQLite는 락 없이 진행 + warn 로그).
     - 존재하지 않는 경우 새로운 `Inventory` 행 생성(quantity = PO.quantity).
     - 존재하는 경우 `Inventory.quantity += PO.quantity` 처리.
  4. PO 상태를 `RECEIVED`로 갱신.
  5. 트랜잭션 커밋. 예외 발생 시 `catch(err)`에서 `err as Error`로 캐스팅해 롤백 및 재전파.

### 3.2 작업지시 생산 완료 (WorkOrder COMPLETED)
- **트리거**: `WO.status`를 `COMPLETED`로 업데이트 요청.
- **수행 과정**:
  1. 트랜잭션 시작 (`QueryRunner`)
  2. 대상 완제품 `Item.styleNo`로 `MasterStyle`을 조회. styleNo가 없거나 해당 style을 찾을 수 없으면 재고 로직 없이 WO 상태만 `COMPLETED`로 변경하고 커밋(warn 로그).
  3. 해당 style의 `Bom`을 `id DESC`로 1개 조회(같은 style에 Bom이 중복 생성될 수 있는 알려진 이슈 — 지금은 최신 것만 사용). Bom이 없어도 2번과 동일하게 재고 로직 없이 상태만 변경.
  4. Bom의 각 `BomItem`(`material` = 원자재 Item)에 대해 필요량 = `consumption * targetQuantity`를 계산하고 각 원자재의 현재 재고 수량과 비교.
     - 원자재 재고가 하나라도 부족할 경우 부족한 자재/필요량/보유량을 명시한 `BadRequestException` 발생 및 트랜잭션 롤백.
  5. 검증 완료 시, 모든 하위 원자재의 재고(`Inventory.quantity`)에서 필요량을 차감.
  6. 대상 완제품의 재고 수량을 `targetQuantity`만큼 가산(재고 행이 없으면 신규 생성).
  7. WO 상태를 `COMPLETED`로 갱신.
  8. 트랜잭션 커밋.

---

## 4. 행 수준 보안 (Row Level Security, RLS) 및 공통 가드 — **[삭제됨, PR-015]**
> `modules/po`(v2) 설계와 함께 제거됨. 사유: 2주간 방치된 스텁, RLS는 SQLite 비호환, 프론트 미참조. 아래는 과거 설계 기록으로만 남김.
- ~~**RLS 세션 Guard**: `rls-session.guard.ts`는 요청을 보내는 사용자 세션을 DB 커넥션 내 RLS 변수로 주입합니다. 이를 통해 동일 데이터베이스 내에서 사용자 또는 테넌트 간 데이터 영역이 강제로 차단 및 격리되도록 동작합니다.~~
- ~~**RLS Cleanup Interceptor**: 요청이 종료된 후 RLS 전역 변수가 다른 커넥션 요청에 오염되지 않도록 청소(`rls-cleanup.interceptor.ts`) 작업을 처리합니다.~~

---

## 5. 공급업체 및 물류 도메인

### 5.1 공급업체 도메인 (Supplier Domain) — 구현됨
- **엔티티**: `Supplier` (`id`, `code`, `name`, `businessNumber`, `contactPhone`, `email`, `address`)
- **연계 규칙**: `PurchaseOrder`는 특정 `Supplier`와 다대일(`@ManyToOne`) 관계를 형성하게 되며, 발주 생성 시 해당 품목의 주 공급업체를 필수 지정하여 조달 처리를 추적합니다.

### 5.2 물류/송장 도메인 (Logistics/Shipment Domain) — 구현됨 (PR-019)
- **엔티티**: `Shipment` (`id`, `shipmentNumber`, `carrierName`, `trackingNumber`, `status` - SHIPPING|DELIVERED, `estimatedArrival`)
- **API**: `ShipmentsController`(`ShipmentsService` 기반 실제 Repository 영속화)가 `POST /shipments`, `GET /shipments`, `GET /shipments/:id`, `PATCH /shipments/:id/status`, `DELETE /shipments/:id`를 제공. 상태 전이는 `SHIPPING -> DELIVERED`만 허용(그 외 모든 요청은 `BadRequestException`).
- **연계 규칙**: `PurchaseOrder.shipmentId`(nullable)로 `Shipment`를 참조하며, PO 조회(`findAll`/`findOne`) 시 이미 `relations`에 `shipment`가 포함되어 배송 정보가 함께 내려감(별도 신규 구현 불필요, 기존 관계 확인만 완료).
