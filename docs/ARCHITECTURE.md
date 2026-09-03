# SCM 백엔드 시스템 아키텍처 (System Architecture)

본 문서는 **SCM 백엔드 API 서비스**의 아키텍처 원칙, 패키지 구성 구조, 엔티티 관계, 트랜잭션 관리 및 보안 설계를 기술합니다.

---

## 1. 아키텍처 설계 원칙 (Architectural Principles)
- **모듈화 및 단일 책임 원칙 (Modular & SRP)**: 각 도메인 영역(인증, 품목, 재고, 발주, 작업지시 등)은 자체 모듈, 서비스, 컨트롤러 및 엔티티를 가지며 고유의 책임에 집중합니다.
- **트랜잭션 ACID 보장 (Transactional ACID)**: 상태 변화가 유기적으로 연쇄 반응하는 SCM 도메인 특성상, 일관성(Consistency)과 격리성(Isolation)을 유지하기 위해 TypeORM `QueryRunner`를 사용한 명시적 트랜잭션을 적용합니다.
- **안전한 권한 제어 (Security)**: 전역 `JwtAuthGuard`를 통해 인증을 강제합니다. (RLS/멀티테넌시는 4절 참고 — v2 설계와 함께 제거됨)

---

## 2. 도메인 엔티티 관계 (Entity Relationship Diagram - Conceptual)

```
       [ Item ] <-----------------------+
          |                             |
          | 1                           | 1
          |                             |
          v *                           v *
       [ Bom ]                    [ Inventory ]
(parentItemId / childItemId)       (itemId / quantity)
          ^                             ^
          |                             |
          +---------------+-------------+
                          |
                          | (ManyToOne)
                          |
             +------------+------------+
             |                         |
             v *                       v *
     [ PurchaseOrder ]           [ WorkOrder ]
   (itemId / quantity)       (itemId / targetQuantity)
```

### 2.1 엔티티 상세 설명
- **Item Entity**: 품목 마스터. `id`, `code`, `name`, `type`(완제품/반제품/원자재 등), `unit`, `spec` 관리.
- **Bom Entity**: 하위 품목 관계 및 소요량 정보. 자기 참조 형태(`parentItemId` -> `childItemId`).
- **Inventory Entity**: 실시간 창고 내 수량 정보. `itemId`로 Item 엔티티와 ManyToOne 관계를 맺음.
- **PurchaseOrder Entity**: 외부 조달 주문서. 발주 수량(`quantity`) 및 현재 상태(`status`) 관리.
- **WorkOrder Entity**: 사내 제조 생산 지시서. 목표 수량(`targetQuantity`) 및 생산 진행 상태(`status`) 관리.

---

## 3. 핵심 비즈니스 연동 시나리오 (Core Business Scenarios)

### 3.1 발주 입고 완료 (PurchaseOrder RECEIVED)
- **트리거**: `PO.status`를 `RECEIVED`로 업데이트 요청.
- **수행 과정**:
  1. 트랜잭션 시작 (`QueryRunner`)
  2. PO의 기존 상태 확인 및 타당성 검증 (이미 `RECEIVED`이거나 `CANCELLED`인 경우 예외 발생)
  3. PO 상태를 `RECEIVED`로 갱신.
  4. 대상 품목(`itemId`)에 해당하는 `Inventory`를 조회.
     - 존재하지 않는 경우 새로운 `Inventory` 행 생성.
     - 존재하는 경우 `Inventory.quantity += PO.quantity` 처리.
  5. 트랜잭션 커밋.

### 3.2 작업지시 생산 완료 (WorkOrder COMPLETED)
- **트리거**: `WO.status`를 `COMPLETED`로 업데이트 요청.
- **수행 과정**:
  1. 트랜잭션 시작 (`QueryRunner`)
  2. WO의 기존 상태 확인 (이미 `COMPLETED`이거나 `CANCELLED`인 경우 예외 발생)
  3. 대상 완제품(`itemId`)의 하위 BOM 구조를 모두 조회하여 소요량(BOM 수량 * WO 목표수량) 계산.
  4. 각 하위 원자재별 현재 재고 수량을 확인 및 비교.
     - 원자재 재고가 소요량보다 부족할 경우 `BadRequestException` 발생 및 트랜잭션 롤백.
  5. 검증 완료 시, 모든 하위 원자재의 재고(`Inventory.quantity`)에서 소요량을 차감.
  6. 대상 완제품(`itemId`)의 재고 수량을 `targetQuantity`만큼 가산.
  7. WO 상태를 `COMPLETED`로 갱신.
  8. 트랜잭션 커밋.

---

## 4. 행 수준 보안 (Row Level Security, RLS) 및 공통 가드 — **[삭제됨, PR-015]**
> `modules/po`(v2) 설계와 함께 제거됨. 사유: 2주간 방치된 스텁, RLS는 SQLite 비호환, 프론트 미참조. 아래는 과거 설계 기록으로만 남김.
- ~~**RLS 세션 Guard**: `rls-session.guard.ts`는 요청을 보내는 사용자 세션을 DB 커넥션 내 RLS 변수로 주입합니다. 이를 통해 동일 데이터베이스 내에서 사용자 또는 테넌트 간 데이터 영역이 강제로 차단 및 격리되도록 동작합니다.~~
- ~~**RLS Cleanup Interceptor**: 요청이 종료된 후 RLS 전역 변수가 다른 커넥션 요청에 오염되지 않도록 청소(`rls-cleanup.interceptor.ts`) 작업을 처리합니다.~~

---

## 5. 공급업체 및 물류 도메인 확장 모델 (Future Extensions)

### 5.1 공급업체 도메인 (Supplier Domain)
- **엔티티**: `Supplier` (`id`, `code`, `name`, `businessNumber`, `contactPhone`, `email`, `address`)
- **연계 규칙**: `PurchaseOrder`는 특정 `Supplier`와 다대일(`@ManyToOne`) 관계를 형성하게 되며, 발주 생성 시 해당 품목의 주 공급업체를 필수 지정하여 조달 처리를 추적합니다.

### 5.2 물류/송장 도메인 (Logistics/Shipment Domain)
- **엔티티**: `Shipment` (`id`, `shipmentNumber`, `carrierName`, `trackingNumber`, `status` - SHIPPING|DELIVERED, `estimatedArrival`)
- **연계 규칙**: 발주 상태가 발행되어 이송 중이거나, 완제품 출고 시 `Shipment`를 매핑하여 실시간 물류 위치를 확인하고 운송 품질 및 지연 가능성을 관리합니다.
