# MERGE-11 반영 보고서

지시서: `prompt-reports`가 아닌 "MERGE-11 — 통합 병합 지시서"(마이그레이션 없는 PR 9건, 2026-10-14 작성분 + PR-193) — 사용자가 대화로 전달, 파일 미보관.

---

## 단계 9 · PR-193 — "선적 기본정보"에서 Carrier 제외

- 브랜치: `fix/export-defaults-remove-carrier`
- 병합 전 main SHA: `455a961`(PR-192 반영 직후)
- 병합 후 main SHA: `1fd14cb`
- 선행 단계: 없음(독립 — 지시서 순서와 무관하게 먼저 처리)

### 변경 파일 (origin/main...origin/fix/export-defaults-remove-carrier, 10개)
- `frontend-app/src/api/exportShipmentDefaults.service.ts`
- `frontend-app/src/components/ExportShipmentDefaultsManager.tsx`
- `frontend-app/src/components/ExportShipmentManager.tsx`
- `prompt-reports/PR-193-report.md`
- `src/export-shipment-defaults/dto/update-export-shipment-defaults.dto.ts`
- `src/export-shipment-defaults/entities/export-shipment-defaults.entity.ts`
- `src/export-shipment-defaults/export-shipment-defaults.service.spec.ts`
- `src/export-shipment-defaults/export-shipment-defaults.service.ts`
- `src/export-shipments/export-shipments.service.ts`
- `test/export-shipments-flow.e2e-spec.ts`

마이그레이션 변경 없음(`src/migrations/` 0건). `.env*`/엑셀/PDF/CSV/이미지/`vision-eval-out/` 없음. `package.json`/lock 변경 없음. `carrier` 컬럼은 엔티티에 그대로 남아 있고(추가 전용 원칙 준수) 저장/조회에만 쓰이지 않도록 바뀜 — DB 스키마 변경 없음.

### 충돌 해결 내역
`git merge origin/main`(PR-196·PR-192 반영분 포함) 시 `src/export-shipments/export-shipments.service.ts` 1개 파일에서 자동 병합(auto-merge, 수동 개입 없음) — PR-196이 추가한 스타일 귀속 로직과 PR-193의 carrier 제거가 서로 다른 위치를 건드려 충돌 마커 없이 합쳐짐. 그 외 충돌 없음.

### 테스트 숫자

| 항목 | PR-193 보고서 기준선 | 이번 게이트 B 검증 |
|---|---|---|
| 백엔드 `jest` 전체 | 63 suites / 798 tests | **65 suites / 834 tests** |
| 백엔드 e2e(`--maxWorkers=2`) | 65 suites / 507 tests | **66 suites / 519 tests** |
| 프론트 `vitest run` | (PR-193 보고서에 미기재) | **53 files / 346 tests** |
| 백엔드/프론트 `tsc` · `build` | 통과 | 통과 |

기준선보다 전부 많거나 같음(선행 반영분 PR-192·PR-196 포함으로 증가) — 실패 0건.

### 배포 안내
이 PR은 마이그레이션이 없으므로 Render 배포 로그에서 `No migrations are pending`과 Live 상태만 확인하면 된다.

### 사용자가 화면에서 확인할 것
- 선적 기본정보(설정) 화면에 Carrier 입력 칸이 없다.
- 새 수출 선적 건을 생성하면 헤더의 Carrier가 기본값 없이 빈칸에서 시작한다.
- 건별 헤더에서 Carrier를 직접 입력하는 기능은 그대로 남아 있다(그 값은 저장·사용됨).

---

**다음 입력 필요**: Render 배포 확인 후 `배포확인: PR-193` 줄을 붙여 다시 보내 주세요.
