# Data Mapping Principles

본 프로젝트의 모든 데이터 매핑 작업은 아래의 운영 지침 및 파이프라인을 엄격히 준수합니다.

## 1. 단계별 단독 진행 규칙
- 42개 단계를 한 번에 진행하지 않으며, 한 번에 하나의 STEP만 수행 후 사용자의 명시적 승인을 기다린다.
- "다음 단계 진행해 주세요"와 같은 승인 없이는 절대 다음 단계로 넘어가지 않는다.

## 2. 결과 작성 표준 양식 (7개 항목)
각 STEP 수행 완료 시 다음 양식에 맞춰 보고서를 작성한다:
① 수행 내용 (무엇을 분석했는지)
② 확인된 사실 (실제 데이터에서 확인된 내용)
③ 분석 결과 (업무적 의미 설명)
④ 불확실한 데이터 (UNKNOWN, AMBIGUOUS, CONFIRM_REQUIRED, MANUAL_REVIEW)
⑤ 오류 / 예외 (#REF!, #VALUE!, 누락 등)
⑥ 설계에 미치는 영향 (DB 및 Mapping 설계 영향)
⑦ 다음 단계 (확인할 내용 및 "STEP XX 완료. 다음 단계 진행을 승인해 주세요." 문구 필수 명시)

## 3. Data Mapping 기본 구조
모든 데이터 변환 프로세스는 아래 파이프라인을 준수한다:
`Source` -> `Normalization` -> `Mapping Rule` -> `Master Lookup` -> `Standard Data`

## 4. Mapping DB 및 Master Data 관리 원칙 (원칙 8~12)
8. **Mapping DB 구조화**: 매핑 정보 및 규칙은 코드 하드코딩을 지양하고 DB 테이블로 관리한다.
   - 필수 테이블: `import_batches`, `import_rows`, `mapping_rules`, `mapping_values`, `mapping_logs`, `mapping_exceptions`
9. **Rule과 Result의 분리**: 매핑 규칙(Mapping Rule)과 특정 작업의 매핑 결과(Mapping Result) 데이터는 완전히 분리하여 설계한다.
10. **Mapping Log 추적성 보장**: 모든 매핑 로그는 추적 항목(`batch_id`, `source_row_id`, `source_field`, `normalized_value`, `mapping_rule_id`, `mapping_status` 등)을 포함하여 매핑의 근거를 보존한다.
11. **Master Data 연동**: 매핑 결과는 반드시 Master Data의 내부 ID와 연결한다.
12. **미존재 데이터 처리**: 마스터 데이터가 존재하지 않을 경우 자동 생성을 금지하고, `NEW_MASTER_CANDIDATE`, `MANUAL_REVIEW`, `UNKNOWN_MASTER` 상태를 할당하여 관리자 승인 절차를 따른다.

## 5. BOM 및 검증 관리 원칙 (원칙 17~20)
17. **BOM 생성 규칙**: BOM은 [Style -> Color -> Material -> Specification -> Consumption -> Required Quantity] 매핑 구조를 따르며, 원본 Excel에서 확인된 실제 계산 방식을 기준으로 생성한다.
18. **BOM Version 관리**: 변경 시 기존 레코드를 유지하고 버저닝(`bom_version`, `change_reason`, `changed_at`, `changed_by`)하여 변경 이력을 보존한다.
19. **5단계 독립 Validation**: 매핑 성공과 검증 성공을 분리하고, 5개 검증 레이어(Schema, Master, Business, Calculation, Consistency)를 독립적으로 수행한다.
20. **Exception 보존 및 관리**: 처리 불가능하거나 검증 실패한 데이터는 세분화된 예외 코드(UNKNOWN_MATERIAL 등)와 함께 `exception_logs`에 보존하여 수동 검토 및 개선에 활용한다.

## 7. 작업 종료 전 자체 검증 (원칙 28)
제출 전 다음 10가지 항목을 체크한다:
□ 기존 Mapping Rule을 위반하지 않았는가?
□ 승인된 Mapping을 임의로 변경하지 않았는가?
□ 실제 데이터에 없는 내용을 추정하지 않았는가?
□ Mapping과 Validation을 혼동하지 않았는가?
□ Master ID를 임의 생성하지 않았는가?
□ 원본 데이터를 보존했는가?
□ Exception을 누락하지 않았는가?
□ 데이터 추적성이 유지되는가?
□ 이전 STEP의 확정사항과 충돌하지 않는가?
□ 새롭게 발견된 설계 충돌을 숨기지 않았는가?

## 8. STEP 진행 명령 및 결과 출력 양식 (원칙 29)
- 해당 단계의 작업만 수행하며, 미결정 사항을 임의로 확정하지 않는다.
- 각 STEP 종료 시 다음 양식으로 결과를 작성한다:
  1) 수행 내용
  2) 확인된 사실
  3) Mapping 결과
  4) 설계 결정
  5) 불확실한 사항
  6) Exception
  7) 기존 규칙과의 충돌 여부
  8) 다음 단계에서 필요한 사항
  9) "STEP XX 완료. 다음 단계 진행을 승인해 주세요."
