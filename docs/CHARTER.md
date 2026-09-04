# SCM 백엔드 시스템 헌장 (Project Charter)

> Status: 최종 검증 2026-09-04, PR-001~019 반영

본 프로젝트 헌장은 **NestJS, TypeORM, TypeScript 기반 SCM(공급망 관리) 백엔드 시스템**의 사업적/기술적 비전, 목표 범위 및 핵심 품질 지표를 정의합니다.

---

## 1. 프로젝트 비전 및 목적 (Vision & Purpose)
SCM 백엔드 시스템은 원자재 수급, 자재명세서(BOM) 관리, 재고 제어, 생산(작업지시), 발주, 그리고 장기적으로 공급업체 및 물류 연동까지 포함하는 **공급망 프로세스의 디지털 전환 및 완전 자동화**를 목적으로 합니다.
실시간 데이터 정합성을 유지하고 비즈니스 흐름 간의 유기적 연계를 보장하여 비용을 절감하고 납기를 단축하는 강건한 시스템을 지향합니다.

---

## 2. 핵심 도메인 모델 (Core Domain Models)

### 2.1 품목 및 BOM (Item & Bill of Materials)
- **품목 (Item)**: 완제품, 반제품, 원자재 등 모든 관리 품목의 마스터 데이터. `FINISHED_GOOD` 타입 Item은 `styleNo`로 소속 `MasterStyle`을 값으로만 참조함(관계 대신 값 참조 — 모듈 간 순환 의존 방지 목적).
- **BOM (자재명세서)**: `Bom`(스타일 단위 헤더, `style`로 `MasterStyle`을 `@ManyToOne` 참조)과 `BomItem`(하위 원자재 라인, `material`로 `Item`을 `@ManyToOne` 참조 + `consumption`(단위 소요량) + `requiredQty`)의 1:N 구조. `src/boms/`의 `BomsModule`이 두 엔티티를 전담 소유하며, `mapping`/`items`/`work-orders` 모듈이 이를 import해 사용함. 같은 style에 Bom이 여러 개 생성될 수 있는 알려진 이슈가 있어, 재고 차감 시에는 `id DESC`로 가장 최근 Bom 하나만 사용함.

### 2.2 공급업체 및 조달 (Supplier & Procurement)
- **공급업체 (Supplier)**: 원자재를 납품하는 외부 파트너 정보.
- **발주 (Purchase Order)**: 품목 조달을 위해 공급업체에 발행하는 구매 주문서. 조달 완료 시 재고 증가로 연계됨.

### 2.3 재고 (Inventory)
- **창고/재고 (Inventory)**: 품목별, 위치별(또는 창고별) 실시간 물리 재고 수량 제어. 발주 입고 시 가산되며, 작업지시 생산 완료 시 원자재 차감 및 완제품 가산이 수행됨.

### 2.4 주문 및 작업지시 (Order & Work Order)
- **고객 주문 (Sales Order)**: 완제품 공급을 위한 고객 주문서 (향후 확장 예정).
- **작업지시 (Work Order)**: 공장 내부 생산 명령서. 작업 완료 시 BOM에 근거한 원자재 재고 자동 차감 및 완제품 재고 생산이 연동됨.

### 2.5 물류 및 운송 (Logistics & Shipment)
- **물류 (Logistics)**: 원자재 입고 물류 및 완제품 출고 물류 정보. 운송 상태 추적 및 입출고 검수 단계와의 연동 지원.

---

## 3. 모듈 간 비즈니스 관계 및 연계 규칙
1. **발주(PO) 상태 전이와 재고 연동**:
   - `PENDING` -> `RECEIVED` 상태 변경 시, 발주된 품목의 수량이 해당 품목의 재고(`Inventory.quantity`)에 실시간 누적되어야 함.
2. **작업지시(WO) 완료와 BOM 기반 재고 연동**:
   - `IN_PROGRESS` -> `COMPLETED` 상태 변경 시, 완제품 `Item.styleNo`로 `MasterStyle`을 찾고 그 style의 최신 `Bom`(`id DESC`)을 조회함. styleNo 미설정이거나 해당 style에 Bom이 없으면 재고 로직 없이 상태만 변경(warn 로그).
   - Bom의 각 `BomItem`(`material` = 원자재 Item)에 대해 필요량 = `consumption * targetQuantity`를 계산하여 모든 하위 원자재의 재고를 차감하고 완제품(`item`)의 재고를 지시 수량만큼 가산해야 함.
   - 단 하나의 원자재라도 재고가 부족할 경우 전체 트랜잭션을 롤백하고 실패 처리해야 함.

---

## 4. 핵심 성공 및 품질 지표
- **데이터 정합성 (Data Consistency)**: 다중 모듈 연동 트랜잭션의 ACID 보장 및 미스매치 제로화.
- **확장성 (Scalability)**: 공급업체 및 글로벌 물류 인프라 API 연동에 유연하게 대응할 수 있는 아키텍처.
- **보안성 (Security)**: RLS(Row Level Security) 및 세밀한 역할 권한 제어(`RolesGuard`)를 통한 내부 데이터 보호.
