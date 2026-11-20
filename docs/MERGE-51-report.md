# MERGE-51 — PR-246 머지 결과

- 대상: `feat/composition-save-path` (head 385e506) → `main` fast-forward (c6d687e → 385e506)
- 마이그레이션 없음 → Neon 게이트·Render 마이그레이션 확인 불필요. Render 는 코드만 배포. 롤백이 필요하면 머지 커밋 revert(force-push 금지).

## 테스트 (머지된 main 기준)
| | 직전 기준(c6d687e) | 결과 |
|---|---|---|
| 백엔드 jest | 1312 | 1347 통과 |
| 프런트 vitest | 860 | 882 통과 |
| e2e (`--maxWorkers=2`) | 623 | 631 통과 |

백엔드 `nest build`, 프런트 `tsc -b`·build 통과.

## 변경 파일 (22개, 범위 내)
백엔드: `src/mapping/dto/commit-mapping.dto.ts`, `src/mapping/services/mapping-commit.service.ts`(+spec), `src/mapping/utils/composition-update.util.ts`(+spec), `src/mapping/utils/sales-order-bom-compare.util.ts`, `src/sales-orders/dto/ai-analysis.dto.ts`, `src/sales-orders/sales-orders.service.ts`(+spec), `test/composition-save-path-flow.e2e-spec.ts`
프런트: `api/salesOrders.service.ts`, `components/CompositionSummary.tsx`(+test), `components/SalesOrderBomCompareStep.tsx`(+test), `components/SalesOrderUploadModal.tsx`, `utils/commitNotices.ts`, `utils/compositionReview.ts`(+test), `utils/salesOrderBomCompareReview.ts`(+test), `utils/salesOrderBomReview.test.ts`
마이그레이션·package/lock·`.env`·데이터 파일·인식 프롬프트·엑셀 파서·수입 선적/서류 코드·`prompt-reports/`·`CLAUDE.md` 없음.

## 미기재 경고 대상 구분 (코드 그대로)
`겉감`, `안감`, `배색`, `배색감`, `퀼팅안감`, `폴리트윌안감` (`COMPOSITION_TARGET_CATEGORIES`). 경고는 안내만 하고 저장·진행을 막지 않는다.

## 한계
프런트에 jsdom 이 없어 모달 입력칸·요약 렌더는 자동 테스트가 없다(`CompositionSummary` 정적 렌더와 순수 함수 테스트, `tsc`·빌드로 대체). 화면 확인은 PR-246 보고서의 확인 순서로 수동 진행.
