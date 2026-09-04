# 02. 모듈 간 관계 및 비즈니스 트랜잭션 (MODULE RELATIONS)

> Status: 최종 검증 2026-09-04, PR-001~019 반영

## 1. TypeORM 엔티티 관계
- **MasterStyle <-> Bom**: MasterStyle은 여러 Bom을 가짐 (`@OneToMany`), Bom은 `style`로 MasterStyle을 참조 (`@ManyToOne`)
- **Bom <-> BomItem**: Bom은 여러 BomItem을 가짐 (`@OneToMany`), BomItem은 `bom`으로 Bom을 참조 (`@ManyToOne`)
- **BomItem <-> Item**: BomItem은 `material`로 원자재 Item을 참조 (`@ManyToOne`) — 과거 `materialId` 숫자 컬럼에서 정식 FK 관계로 전환됨
- **Item.styleNo <-> MasterStyle**: `FINISHED_GOOD` Item은 `styleNo` 값으로만 MasterStyle을 참조(관계 아님, `items`/`styles` 모듈 간 순환 의존 방지 목적) — 서비스 레이어에서 styleNo로 MasterStyle을 조회해 사용
- **Inventory <-> Item**: Inventory는 특정 Item에 속함 (`@ManyToOne`, FK: `itemId`)
- **PurchaseOrder <-> Item**: PO는 특정 Item에 속함 (`@ManyToOne`, FK: `itemId`)
- **PurchaseOrder <-> Shipment**: PO는 특정 Shipment에 속할 수 있음 (`@ManyToOne`, FK: `shipmentId`, nullable) — PO 조회(`findAll`/`findOne`) 시 `relations`에 포함되어 배송 정보가 함께 내려감
- **WorkOrder <-> Item**: WO는 특정 Item에 속함 (`@ManyToOne`, FK: `itemId`)

## 2. 비즈니스 로직 연동 규칙
- **발주 입고 (PO RECEIVED)**:
  - `PurchaseOrder.status`가 `RECEIVED`로 변경되면 QueryRunner 트랜잭션 내에서 PO를 재조회해 이미 `RECEIVED`/`CANCELLED`면 `BadRequestException`으로 중복 입고를 차단함.
  - 통과하면 해당 `itemId`의 `Inventory`를 조회(없으면 신규 생성, 있으면 `quantity += PO.quantity`)하고 PO 상태를 `RECEIVED`로 갱신 후 커밋함.
  - `Inventory` 조회는 `inventories.service.ts`의 `stockIn()`과 동일한 `pessimistic_write` 락을 사용하되, SQLite는 이 락을 지원하지 않아(`LockNotSupportedOnGivenDriverError`) `dataSource.options.type !== 'sqlite'`일 때만 락을 적용함(Postgres 프로덕션 기준 정상 동작, 로컬 SQLite는 락 없이 진행 + warn 로그).
- **생산 완료 (WO COMPLETED)**:
  - `WorkOrder.status`가 `COMPLETED`로 변경되면 QueryRunner 트랜잭션을 시작하고, 완제품 `Item.styleNo`로 `MasterStyle`을 조회함. styleNo가 없거나 해당 style을 찾을 수 없으면 재고 로직 없이 상태만 `COMPLETED`로 변경(warn 로그).
  - 찾았으면 그 style의 `Bom`을 `id DESC`로 1개 조회함(같은 style에 Bom이 중복 생성될 수 있는 알려진 이슈 — 지금은 최신 것만 사용). Bom이 없어도 재고 로직 없이 상태만 변경.
  - Bom의 각 `BomItem`(`material` = 원자재 Item)에 대해 필요량 = `BomItem.consumption * WorkOrder.targetQuantity`를 계산하고, 각 원자재의 `Inventory.quantity`와 비교함.
  - 원자재 재고가 하나라도 부족할 경우 부족한 자재/필요량/보유량을 명시한 `BadRequestException` 발생 및 트랜잭션 롤백.
  - 충분하면 모든 원자재의 재고(`Inventory.quantity`)에서 필요량을 차감하고, 완제품의 재고(`Inventory.quantity`)를 `targetQuantity`만큼 증가(없으면 신규 생성)시킨 뒤 WO 상태를 `COMPLETED`로 갱신.
- **출하 상태 전이 (Shipment)**:
  - `Shipment.status`는 `SHIPPING -> DELIVERED` 전이만 허용됨. 이미 `DELIVERED`인 건(역전이·동일상태 재요청 포함) 모두 `BadRequestException`.