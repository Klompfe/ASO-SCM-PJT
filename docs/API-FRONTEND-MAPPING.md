# API-프론트엔드 엔드포인트 매핑표

> Status: 2026-09-05 최초 작성 (PR-037, 작업목록 9번/P2-9 산출물), styles/master 섹션 PR-042에서 최신화
>
> 백엔드 컨트롤러 전체(`src/**/*.controller.ts`)와 프론트엔드 `frontend-app/src/api/*.service.ts` +
> 컴포넌트에서 실제로 호출하는 코드를 대조해 작성했다. "호출 프론트"가 없는 행은 **미사용**으로 표시한다.

## auth

| 메서드/경로 | 프론트 함수 | 호출 컴포넌트 |
|---|---|---|
| POST /auth/register | `auth.service.ts:register` | `LoginPage.tsx` |
| POST /auth/login | `auth.service.ts:login` | `LoginPage.tsx` |

## items

| 메서드/경로 | 프론트 함수 | 호출 컴포넌트 |
|---|---|---|
| POST /items | `items.service.ts:createItem` | `ItemsManager.tsx` |
| GET /items | `items.service.ts:getItems` | `ItemsManager.tsx`, `PurchaseOrdersManager.tsx`, `Dashboard.tsx` |
| POST /items/upload-preview | `items.service.ts:uploadPreview` | **미사용** — 함수는 정의돼 있으나 어떤 컴포넌트도 import하지 않음(PR-023/024에서 확인: 실제 업로드 버튼은 `/mapping/parse`를 호출) |
| POST /items/bulk-insert | `items.service.ts:bulkInsert` | **미사용** — 정의만 있고 호출부 없음 |
| GET /items/:id | - | **미사용** |
| PATCH /items/:id | - | **미사용** |
| DELETE /items/:id | - | **미사용** |
| DELETE /items/clear/all | - | **미사용** |

## mapping

| 메서드/경로 | 프론트 함수 | 호출 컴포넌트 |
|---|---|---|
| POST /mapping/parse | `mapping.service.ts:parseMappingFile` | `ItemsManager.tsx` |
| GET /mapping/check-exists | `mapping.service.ts:checkStyleExists` | `ItemsManager.tsx` |
| POST /mapping/commit | `mapping.service.ts:commitMapping` | `MappingPreviewModal.tsx` |

## purchase-orders (PR-037 신규 화면)

| 메서드/경로 | 프론트 함수 | 호출 컴포넌트 |
|---|---|---|
| POST /purchase-orders | `purchaseOrders.service.ts:createPurchaseOrder` | `PurchaseOrdersManager.tsx` |
| GET /purchase-orders | `purchaseOrders.service.ts:getPurchaseOrders` | `PurchaseOrdersManager.tsx` |
| GET /purchase-orders/:id | - | **미사용** |
| PATCH /purchase-orders/:id/status | `purchaseOrders.service.ts:updatePurchaseOrderStatus` | `PurchaseOrdersManager.tsx` (RECEIVED/CANCELLED 둘 다) |
| DELETE /purchase-orders/:id | - | **미사용** — 화면은 취소(상태 변경)만 제공하고 삭제 UI는 없음(요구 범위 밖) |

## suppliers (PR-037 신규 화면)

| 메서드/경로 | 프론트 함수 | 호출 컴포넌트 |
|---|---|---|
| POST /suppliers | `suppliers.service.ts:createSupplier` | `SuppliersManager.tsx` |
| GET /suppliers | `suppliers.service.ts:getSuppliers` | `SuppliersManager.tsx`, `PurchaseOrdersManager.tsx`(발주 생성 폼 드롭다운) |
| GET /suppliers/:id | - | **미사용** |
| PATCH /suppliers/:id | `suppliers.service.ts:updateSupplier` | `SuppliersManager.tsx` |
| DELETE /suppliers/:id | `suppliers.service.ts:deleteSupplier` | `SuppliersManager.tsx` |

## shipments

| 메서드/경로 | 프론트 함수 | 호출 컴포넌트 |
|---|---|---|
| POST /shipments | `shipments.service.ts:createShipment` | `ShipmentsManager.tsx` |
| GET /shipments | `shipments.service.ts:getShipments` | `ShipmentsManager.tsx`, `Dashboard.tsx` |
| GET /shipments/:id | - | **미사용** |
| PATCH /shipments/:id/status | - | **미사용** — `ShipmentsManager.tsx`에 상태 변경(SHIPPING→DELIVERED) UI 자체가 없음 |
| DELETE /shipments/:id | - | **미사용** |

## work-orders

| 메서드/경로 | 프론트 함수 | 호출 컴포넌트 |
|---|---|---|
| POST /work-orders/upload-image | `workOrders.service.ts:uploadWorkOrderImage` | `WorkOrderUploadModal.tsx` |
| POST /work-orders | - | **미사용** — `WorkOrderUploadModal.handleConfirm()`은 AI 분석 결과를 실제로 저장하는 API 호출 없이 토스트만 띄우는 미완성 상태(코드 주석: "여기에 최종 DB 저장 로직") |
| GET /work-orders | `workOrders.service.ts:getWorkOrders` | `WorkOrdersManager.tsx`, `Dashboard.tsx` |
| GET /work-orders/:id | - | **미사용** |
| PATCH /work-orders/:id/status | `workOrders.service.ts:updateWorkOrderStatus` | `WorkOrdersManager.tsx` |
| DELETE /work-orders/:id | - | **미사용** |

## inventories

| 메서드/경로 | 프론트 함수 | 호출 컴포넌트 |
|---|---|---|
| GET /inventories | - | **미사용** |
| GET /inventories/:id | - | **미사용** |
| POST /inventories/:id/stock-in | - | **미사용** |
| POST /inventories/:id/stock-out | - | **미사용** |

## styles / master

> **PR-038/040 이후 최신화(2026-09-05)**: 이전 버전 문서는 GET/POST /styles가 라우트 충돌·미등록으로
> 동작하지 않는다고 기록했으나, PR-038(StylesModule 등록 + axiosInstance 전환)과 PR-040(MasterModule의
> 경쟁 컨트롤러 삭제)을 거치며 해소되었다. curl로 POST 후 GET 재조회해 실제 반영됨을 확인했다.

| 메서드/경로 | 프론트 함수 | 호출 컴포넌트 |
|---|---|---|
| POST /styles (`styles/styles.controller.ts`, `StylesModule`) | `styles.service.ts:createStyle` | `StylesManager.tsx` |
| GET /styles (`styles/styles.controller.ts`, `StylesModule`) | `styles.service.ts:getStyles` | `StylesManager.tsx` |

> 참고: `master/master.entities.ts`의 `Style`(`master_styles` 테이블) 엔티티는 PR-040에서 컨트롤러/서비스가
> 제거되어 API로 노출되지 않는다(엔티티 등록만 남아있음 — `transaction/entities/bom.entity.ts`의 미등록 참조
> 때문). 이 표의 `styles`는 별개의 `StylesModule`/`styles` 테이블이며, 실제 프로덕션 BOM/WorkOrder 로직이
> 쓰는 `MasterStyle`(`master_style` 테이블)과도 다른 엔티티다 — 세 엔티티의 장기 통합 여부는 미결정 상태다.

## receivings

| 메서드/경로 | 프론트 함수 | 호출 컴포넌트 |
|---|---|---|
| GET /receivings | - | **미사용** |

## users

| 메서드/경로 | 프론트 함수 | 호출 컴포넌트 |
|---|---|---|
| POST /users | - | **미사용** |
| GET /users | - | **미사용** |
| GET /users/:id | - | **미사용** |
| PATCH /users/:id | - | **미사용** |
| DELETE /users/:id | - | **미사용** |

---

## 요약

- 실제로 프론트에서 호출되는 엔드포인트: auth 2개, items 2개, mapping 3개, purchase-orders 3개(신규), suppliers 4개(신규), shipments 2개, work-orders 3개 = **19개**
- 정의는 있으나 프론트가 호출하지 않는 "미사용" 엔드포인트: 약 20개 이상(대부분 단건 조회 `GET /:id`, 삭제, inventories/users/receivings 전체)
- **라우트 자체가 존재하지 않는 죽은 프론트 코드**: `StylesManager.tsx`가 부르는 `POST /styles`
