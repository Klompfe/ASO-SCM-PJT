# API-프론트엔드 엔드포인트 매핑표

> Status: 2026-09-05 기준 작성 (PR-037, 작업목록 9번/P2-9 산출물)
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

## styles / master ⚠️ 요주의

| 메서드/경로 | 등록 상태 | 프론트 함수 | 호출 컴포넌트 |
|---|---|---|---|
| GET /styles (`master/style.controller.ts`, `MasterModule`) | `app.module.ts`에 등록되어 **실제로 동작함** | - | **미사용** — `StylesManager.tsx`는 이 GET을 아예 호출하지 않고 `const styles: any[] = []; // Placeholder`로 항상 빈 배열만 표시 |
| POST /styles, GET /styles (`styles/styles.controller.ts`, `StylesModule`) | **`StylesModule`이 `app.module.ts`에 import되어 있지 않아 라우트 자체가 존재하지 않음(항상 404)** | - | `StylesManager.tsx`가 `fetch('/styles', {method:'POST', ...})`로 이 경로를 호출 시도 |

> **발견된 별개의 버그(이번 PR 범위 밖, 수정하지 않음)**: `StylesManager.tsx`는 (1) 존재하지도 않는 라우트를 호출하고, (2) `axiosInstance`가 아니라 baseURL 없는 raw `fetch('/styles', ...)`를 직접 써서 `Authorization` 헤더도 붙지 않는다(과거 `MappingPreviewModal.tsx`에서 발견됐던 것과 동일한 유형의 문제). 즉 Styles 등록 화면은 현재 실질적으로 완전히 동작하지 않는다.

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
