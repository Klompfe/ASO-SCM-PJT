# 02. 모듈 간 관계 및 비즈니스 트랜잭션 (MODULE RELATIONS)

## 1. TypeORM 엔티티 관계
- **Item <-> Bom**: Item은 여러 Parent/Child Bom을 가짐 (`@OneToMany`)
- **Inventory <-> Item**: Inventory는 특정 Item에 속함 (`@ManyToOne`, FK: `itemId`)
- **PurchaseOrder <-> Item**: PO는 특정 Item에 속함 (`@ManyToOne`, FK: `itemId`)
- **WorkOrder <-> Item**: WO는 특정 Item에 속함 (`@ManyToOne`, FK: `itemId`)

## 2. 비즈니스 로직 연동 규칙
- **발주 입고 (PO RECEIVED)**:
  - `PurchaseOrder.status`가 `RECEIVED`로 변경되면 `Inventory` 테이블에서 해당 `itemId`의 `quantity`를 발주 수량만큼 증가시킴.
- **생산 완료 (WO COMPLETED)**:
  - `WorkOrder.status`가 `COMPLETED`로 변경되면 해당 완제품(`itemId`)의 BOM 구조를 조회함.
  - 하위 원자재(`childItemId`)들의 재고(`Inventory.quantity`)를 소요량만큼 차감함.
  - 완제품(`itemId`)의 재고(`Inventory.quantity`)를 `targetQuantity`만큼 증가시킴.
  - 원자재 재고가 부족할 경우 `BadRequestException` 발생 및 트랜잭션 롤백.