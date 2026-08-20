# 01. 프로젝트 기본 명세 및 모듈 규격 (PROJECT SPEC)

## 1. 모듈 및 폴더 경로 규칙
- **인증 모듈**: `src/auth/`
- **사용자 모듈**: `src/users/`
- **품목 모듈**: `src/items/`
- **재고 모듈**: `src/inventories/` (단수 `inventory`가 아닌 복수 `inventories` 사용)
- **발주 모듈**: `src/purchase-orders/`
- **작업지시 모듈**: `src/work-orders/`
- **BOM 모듈**: `src/boms/`

## 2. 핵심 엔티티(Entity) 컬럼 명세
- **Item**: `id`, `code`, `name`, `type` (ItemType), `unit`, `spec`, `description`
- **Inventory**: `id`, `itemId` (number), `quantity` (number), `item` (ManyToOne Relationship)
- **PurchaseOrder**: `id`, `itemId` (number), `quantity` (number), `status` (PurchaseOrderStatus: PENDING | RECEIVED | CANCELLED)
- **WorkOrder**: `id`, `itemId` (number), `targetQuantity` (number), `status` (WorkOrderStatus: PENDING | IN_PROGRESS | COMPLETED | CANCELLED)
- **Bom**: `id`, `parentItemId` (number), `childItemId` (number), `quantity` (number)

## 3. 컨트롤러 & 서비스 호출 규격
- `PurchaseOrdersService.findAll({ page, limit, status })` -> 단일 객체 파라미터 전달
- `PurchaseOrdersService.updateStatus(id, status)` -> status 문자열/Enum 값 직접 전달
- 모든 컨트롤러는 `@Public()`이 없는 한 전역 `JwtAuthGuard`의 보호를 받음