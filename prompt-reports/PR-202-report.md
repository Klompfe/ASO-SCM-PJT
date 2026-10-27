# PR-202 완료 보고: 암홀테이프 포장단위 100M/롤 바로잡기 (다데테이프 50M/롤 유지)

Written for: 이 저장소를 관리하는 개발자(변경 요약/테스트 결과/화면 확인 항목을 보려는 사람).

- 브랜치: `fix/amhol-tape-unit-100m`(`origin/main` 최신 `06e1a64`에서 분기). **main에 병합하지 않음.**
- 마이그레이션 새로 만들지 않음, 이미 적용된 `1791100000000-...ts` 수정 안 함. `package.json`/락 파일 변경 없음. 운영 DB 접속·수정 없음. Gemini API 호출 없음.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `frontend-app/src/components/SalesOrderUploadModal.tsx` | 하드코딩 드롭다운 `암홀 (50M/롤)` → `암홀 (100M/롤)` |
| `frontend-app/src/components/ItemsManager.tsx` | 같은 하드코딩 드롭다운(PR-201 조사에서 못 찾았던 **두 번째 복사본**) `암홀 (50M/롤)` → `암홀 (100M/롤)` |
| `frontend-app/src/components/tapePackagingUnitLabels.test.ts`(신규) | 위 두 파일의 소스 텍스트를 Vite `?raw` 임포트로 직접 확인하는 회귀 테스트 |
| `src/boms/utils/thread-cone-price.util.spec.ts` | 순수 포맷 테스트의 `AMHOL` 픽스처값 50→100(이유는 "단순화하거나 못 한 것" 참고) |

## 테스트 숫자(전/후)

| | 전(MERGE-12 완료 시점) | 후 |
|---|---|---|
| 백엔드 단위(jest) | 1002 | **1002**(동일 — 기존 테스트 값만 수정, 추가/삭제 없음) |
| e2e | 555 | **555**(동일) |
| 프런트(vitest) | 485 | **487**(+2, 새 테스트 파일) |

전부 실패 0. 빌드 둘 다 성공. `git diff origin/main --stat -- src/migrations package.json package-lock.json frontend-app/package.json frontend-app/package-lock.json` — 출력 없음(변경 0건).

---

## 1. 조사 결과

### (a) 저장 구조

- 마스터 테이블: **`material_packaging_unit_rules`**(`src/material-packaging-unit-rules/entities/material-packaging-unit-rule.entity.ts`) — 컬럼 `materialSubType`(문자열 키, 예 `'AMHOL'`), `displayName`(`'암홀'`), `packagingUnitLabel`(`'롤'`), **`unitLengthM`(decimal, 포장단위 하나당 길이)**, `note`.
- BOM 쪽 저장: `BomItem.tapeType`(`src/boms/entities/bom-item.entity.ts`)에 **enum 문자열 `'AMHOL'`만** 저장된다 — **숫자(길이)는 BomItem에 전혀 저장되지 않는다**(스냅샷 없음, 중요 — 3번 판정의 근거).

### (b) 화면 드롭다운과 DB의 관계

- `SalesOrderUploadModal.tsx`와 `ItemsManager.tsx`의 드롭다운은 **둘 다 하드코딩된 JSX `<option>` 문자열**(DB를 호출하지 않음). 선택하면 `tapeType`/`threadType` **문자열 코드**(`'AMHOL'` 등)만 저장되고, 숫자(100M)는 저장되지 않는다 — 라벨은 사람이 보는 설명일 뿐.
- **같은 선택지가 두 화면에 각각 하드코딩돼 있음을 이번에 확인**(PR-201 보고서는 `SalesOrderUploadModal.tsx`만 찾았음 — `ItemsManager.tsx:773`에도 동일한 복사본이 있었다).

### (c) 사용처(롤 수·필요 롤 수·발주 수량 계산)

| 파일:줄 | 용도 | 값 소스 |
|---|---|---|
| `src/work-orders/work-orders.service.ts:338` | `packagingRules = await this.materialPackagingUnitRulesService.findAll()` — **매 요청마다 DB를 그대로 조회**(캐시/스냅샷 없음) | 라이브 DB |
| `src/work-orders/utils/material-requirements.util.ts:178-192` | `requiredPackages = Math.ceil(meters / unitLengthM)` — 필요 롤 수 계산(순수 함수, `rule.unitLengthM`을 파라미터로 받음) | 호출자가 넘긴 값(결국 위 라이브 DB 조회값) |
| `frontend-app/src/utils/purchaseOrderForm.ts:141-145` | 위 계산 결과(`requiredPackages`/`shortagePackages`)를 발주 화면 요약 문구로 표시 | 백엔드가 이미 계산해 내려준 값(재계산 안 함) |
| `src/items/items.service.ts:75,372,404` | `MaterialPackagingUnitRule` 리포지토리를 **매번 직접 조회**(품목 화면의 실/테이프 종류 표시·후보 추천용) | 라이브 DB |
| `src/mido-price-table/mido-price-table.service.ts:95-103`, `src/purchase-orders/price-reference.service.ts:152`, `src/export-shipments/utils/meter-price-conversion.util.ts` | 미터단가→콘/롤 단가 환산(가격표/발주 참고단가, 롤 수 계산과는 별개 용도) | 라이브 DB(가격 계산 체인) |

**결론**: 계산은 전부 **그때그때 DB에서 조회**한다. `BomItem`에 길이가 스냅샷으로 저장되지 않으므로, **이미 저장된 BOM 행·발주 어디에도 "암홀 50"이 굳어 있지 않다** — DB 마스터 행 하나(`AMHOL`)만 고치면 과거/현재/미래 계산이 전부 한 번에 바뀐다.

### (d) 흩어진 복사본 전수 검색 (`암홀`/`50`/`AMHOL` grep)

| 파일:줄 | 내용 | 용도 |
|---|---|---|
| `src/migrations/1791100000000-AddMaterialPackagingUnitRulesAndTapeType.ts:38` | `('AMHOL', '암홀', '롤', 50, ...)` | **DB 시드값(틀림, 마이그레이션이라 수정 안 함)** |
| `frontend-app/src/components/SalesOrderUploadModal.tsx` | `<option value="AMHOL">암홀 (50M/롤)</option>` | 화면 하드코딩 라벨 → **이번에 100으로 수정** |
| `frontend-app/src/components/ItemsManager.tsx` | 동일 문자열 | 화면 하드코딩 라벨(두 번째 복사본) → **이번에 100으로 수정** |
| `src/boms/utils/thread-cone-price.util.spec.ts` | `LENGTH_MAP.AMHOL = 50`(테스트 픽스처) | 순수 포맷 테스트 — **이번에 100으로 수정**(아래 설명 참고) |
| `src/export-shipments/utils/meter-price-conversion.util.spec.ts` | `0.01/m × 50m = $0.50/롤`(주석: "실제 INVOICE로 검증된 5개 케이스") | **건드리지 않음** — 아래 "단순화하거나 못 한 것" 참고(위험 표시) |
| `src/mido-price-table/mido-price-table.service.spec.ts`, `src/purchase-orders/price-reference.service.spec.ts` | `{ materialSubType: 'AMHOL', unitLengthM: 50 }` 류 목업 DB 행 | 다른 로직(후보 선택·환산 분기) 테스트용 임의 목업값 — **건드리지 않음**(진짜 값이 몇이든 그 로직 자체의 정답은 안 바뀜) |
| `src/sales-orders/vision.service.ts` `PROMPT`/`RESPONSE_SCHEMA` | `enum: [..., '암홀']` | AI가 "암홀"이라는 **이름**만 인식하게 하는 목록 — 숫자(단위) 언급 없음, **건드릴 필요 없음** |
| `scripts/vision-eval/scoring/bom-match.ts` | `STANDARD_NAME_KEYS`에 `'암홀'` | 이름 매칭용 키워드(숫자 없음) — 해당 없음 |
| `docs/*.csv`, `docs/design/*` | "실크 암홀 테이프" 등 실제 자재명/스펙 문서 | 업무 참고 문서, 숫자 단위 주장 없음 — 해당 없음 |

### (e) 기존 수정 수단

**있음.** `material-packaging-unit-rules` 모듈에 **CRUD API**(`GET/POST/PATCH/DELETE /material-packaging-unit-rules`, `src/material-packaging-unit-rules/material-packaging-unit-rules.controller.ts`)와 **관리 화면**(`frontend-app/src/components/MaterialPackagingUnitRulesManager.tsx`, 사이드바 메뉴명 **"자재 포장단위"**)이 이미 있다.

**일반 사용자가 따라 할 순서**:
1. 사이드바에서 **"자재 포장단위"** 메뉴를 클릭한다.
2. 목록에서 `암홀` 행을 찾아 **수정** 버튼(인라인 편집)을 누른다.
3. "단위당 길이(m)" 칸의 값을 `50`에서 `100`으로 고친다.
4. 저장한다.
5. (다데 행은 그대로 둔다 — 50이 맞다.)

---

## 2. 코드에서 고친 곳 전수 (파일·줄·전/후)

1. `frontend-app/src/components/SalesOrderUploadModal.tsx` — `<option value="AMHOL">암홀 (50M/롤)</option>` → `<option value="AMHOL">암홀 (100M/롤)</option>`
2. `frontend-app/src/components/ItemsManager.tsx` — 동일 변경
3. `src/boms/utils/thread-cone-price.util.spec.ts` — `LENGTH_MAP.AMHOL: 50` → `100`, 해당 테스트 설명·기대값을 `$1.0`으로 수정

공용 상수로 합치지 않고 **각 파일의 값만 각각 고쳤다**(지시대로 범위를 키우지 않음). 중복이 있는 다른 곳(테스트 목업들)은 "위험한 곳"에 적어 둠.

---

## 3. DB 값 처리 판정

**경우 1 — 관리 화면/API로 DB 값을 고칠 수 있음.** 위 1-(e)의 5단계 그대로. **마이그레이션은 만들지 않았다.**

**DB를 고치기 전까지(화면 코드만 배포되고 DB는 아직 50인 기간) 무엇이 보이는지**: 드롭다운 라벨은 "100M/롤"로 보이지만, 실제 **롤 수 계산은 여전히 DB 값(50)을 써서 2배로 많은 롤 수를 보여준다** — 즉 **"표시 문구"와 "실제 계산"이 서로 다른 값을 쓰는 괴리 기간이 생긴다.** DB를 관리 화면에서 100으로 고치는 즉시(캐시·재배포 불필요, 매 요청 라이브 조회) 계산도 바로 맞아진다.

---

## 단순화하거나 못 한 것 / 위험

- `src/export-shipments/utils/meter-price-conversion.util.spec.ts`의 "암홀 테이프: 0.01/m × 50m = $0.50/롤" 테스트는 **"실제 INVOICE로 검증된 5개 케이스"라는 주석이 달려 있어 건드리지 않았다** — 이 50이 실제 과거 인보이스의 계산 근거였을 수 있어, 임의로 100으로 바꾸면 "검증됨"이라는 주장이 거짓이 될 위험이 있다. 이 테스트가 정말 재검토가 필요한지는 실제 인보이스 원본을 다시 대조해야 하며, 이번 PR 범위 밖으로 둔다.
- `mido-price-table.service.spec.ts`/`price-reference.service.spec.ts`의 목업 `unitLengthM: 50`은 **그 테스트가 검증하는 로직(후보 선택·환산 분기 자체)과 무관한 임의값**이라 건드리지 않았다 — 바꿔도 그 테스트들의 통과/실패에 영향이 없다.
- DB의 실제 `AMHOL` 행 값은 **이번 커밋으로 바뀌지 않는다**(코드 PR이라 당연함) — 위 1-(e) 순서대로 사람이 직접 고쳐야 비로소 계산이 맞아진다.

## 사람이 화면에서 확인할 것

1. 작지 분석 검토 화면의 테이프 행 포장단위 드롭다운에 "암홀 (100M/롤)", "다데 (50M/롤)"이 보인다.
2. 관리 화면("자재 포장단위")에서 DB 값을 50→100으로 고친 뒤 새로고침해도 같은 값(100)이 보인다.
3. 암홀 테이프 행에서 필요 롤 수가 100M 기준으로 계산된다(예: 필요 250M → 3롤) — **단, DB 값을 100으로 고친 뒤에만** 맞게 나온다(위 "DB를 고치기 전까지" 설명 참고).
