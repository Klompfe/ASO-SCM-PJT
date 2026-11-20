# MERGE-53 — PR-248 머지 결과

- 대상: `feat/composition-excel-bulk` (head 83b29cd) → `main` fast-forward (f5c8f65 → 83b29cd)
- 마이그레이션 없음 → Neon 게이트·Render 마이그레이션 확인 불필요. Render 는 코드만 배포. 롤백이 필요하면 머지 커밋 revert(force-push 금지).

## 테스트
| | 병합 직전 main(f5c8f65, 측정) | 하한 | 결과 |
|---|---|---|---|
| 백엔드 jest | 1380 | 1408 | 1408 통과 |
| 프런트 vitest | 898 | 915 | 915 통과 |
| e2e (`--maxWorkers=2`) | 634 | 639 | 639 통과 |

백엔드 `nest build`, 프런트 `tsc -b`·build 통과.

## 변경 파일 (16개, 범위 내)
백엔드: `src/mapping/utils/section-parser.util.ts`(+`section-parser-composition.util.spec.ts`), `src/mapping/mapping.controller.ts`, `src/mapping/utils/bom-diff.util.ts`, `src/mapping/services/mapping-commit.service.ts`, `test/composition-excel-flow.e2e-spec.ts`
프런트: `api/mapping.service.ts`, `components/CompositionBulkPanel.tsx`(+test), `components/CompositionSummary.tsx`, `components/MappingPreviewModal.tsx`, `components/SalesOrderUploadModal.tsx`, `utils/bomDiffReview.ts`(+test), `utils/compositionReview.ts`(+test)
마이그레이션·package/lock·`.env`·실제 데이터 파일·작지 인식 스키마/프롬프트·수입 선적/서류 코드·HS 분류 마스터·`prompt-reports/`·`CLAUDE.md` 없음.

## reconcile 변경 요약 (`mapping-commit.service.ts` `applyNewItemValues`)
- 변경 줄: `if (newItem.composition !== undefined) bomItem.composition = newItem.composition ?? null;` 한 줄만 `resolveCompositionUpdate(기존, 새 값, false)` 규칙으로 교체. 요척·수량·단가·수동 필요수량 등 다른 필드 처리 줄은 변경 없음.
- 동작: 기존 혼용률 비어 있음→채움 / 같음→불변 / 다름→유지(경고 "혼용률이 기존 값과 달라 기존 값을 유지했습니다.") / 엑셀 값이 없으면(필드 없음) 기존 값 보존.
- 근거 e2e: `composition-excel-flow` "bom-diff/reconcile 경로…"(OVERWRITE 는 요척만 바꾸고 혼용률 유지, ADD 는 새 행에 저장, 빈 OVERWRITE 는 기존 값 보존).

## 한계
- 엑셀 경로 비교 화면(PR-198)에는 혼용률 상태 표시가 없다 — differs 는 서버 규칙으로 유지된다.
- diff 화면의 SAME 행(이름·색상·규격 동일)은 액션이 없어 엑셀 혼용률로 비어 있는 기존 행을 채울 수 없다(데이터 손실은 없음 — 기존 값 그대로). 일괄 입력(저장 화면·미리보기)이나 자재·BOM 조회의 개별 수정으로 입력한다.
- 저장 후 BOM 조회 화면의 일괄 편집은 범위 밖(행 선택 UI 없음).
- CSV 업로드는 단순 쉼표 분할이라 줄바꿈이 든 헤더("혼용률\n중량")를 열로 못 찾을 수 있다. 못 찾으면 혼용률을 읽지 않을 뿐 오류 없이 기존 동작 그대로.
- 프런트 jsdom 없음: 일괄 입력 패널 클릭 동작은 자동 테스트가 없고(순수 함수·정적 렌더·tsc·빌드로 대체) 화면에서 직접 확인 필요.
