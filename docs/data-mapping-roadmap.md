# SCM Data Mapping Roadmap (42 Steps)

본 로드맵은 SCM 데이터 매핑 프로젝트의 전체 진행 상황을 추적합니다.

| Step | Phase | Description | Status |
| :--- | :--- | :--- | :--- |
| 01 | Phase 1 | 프로젝트 계획 수립 및 목표 설정 | Completed |
| 02 | Phase 1 | 실제 엑셀 파일 데이터 구조 정밀 분석 | Completed |
| 03 | Phase 1 | 데이터 의미 파악 및 업무 규칙 수집 | Completed |
| 04 | Phase 1 | 원본 데이터 샘플링 및 데이터 타입 정의 | Completed |
| 05 | Phase 1 | 데이터 유효성 검증 규칙 파악 | Completed |
| 06 | Phase 1 | 컬럼별 매핑 원칙 수립 | Completed |
| 07 | Phase 1 | 표준 도메인 정의 (Data Dictionary 사전 작업) | Completed |
| 08 | Phase 1 | 데이터 포맷 및 제약조건 식별 | Completed |
| 09 | Phase 1 | 마스터/트랜잭션 데이터 식별 | Completed |
| 10 | Phase 1 | 매핑 예외 케이스 분석 | Completed |
| 11 | Phase 1 | 데이터 정규화 규칙 수립 | Completed |
| 12 | Phase 1 | 파일 단위 매핑 파이프라인 설계 | Completed |
| 13 | Phase 1 | 데이터 매핑 명세서 초안 작성 | Completed |
| 14 | Phase 1 | Data Dictionary 구축 | Completed |
| 15 | Phase 1 | 마스터/트랜잭션 엔티티 분류 정의 | Completed |
| 16 | Phase 2 | 데이터 매핑 원칙 문서화 (10대 원칙) | Completed |
| 17 | Phase 2 | Mapping-Validation 레이어 설계 | Completed |
| 18 | Phase 2 | StandardDataMapper utility 설계 | Completed |
| 19 | Phase 2 | 매핑 규칙 엔티티 설계 | Completed |
| 20 | Phase 2 | 마스터 데이터(Style, Material 등) 엔티티 설계 | Completed |
| 21 | Phase 2 | 트랜잭션 데이터 엔티티 설계 | Completed |
| 22 | Phase 2 | 데이터베이스 스키마 초안 작성 | Completed |
| 23 | Phase 2 | Mapping 규칙 저장 로직 구현 | Completed |
| 24 | Phase 2 | 매핑 유틸리티 코드 구현 | Completed |
| 25 | Phase 2 | 매핑 파이프라인(Controller/Service) 기초 구현 | Completed |
| 26 | Phase 2 | 매핑 데이터 검증 로직 구현 | Completed |
| 27 | Phase 2 | 마스터 데이터 엔티티 구현 | Completed |
| 28 | Phase 2 | 트랜잭션 데이터 엔티티 구현 | Completed |
| 29 | Phase 3 | 백엔드 API 설계 (검색/조회/필터링) | Completed |
| 30 | Phase 3 | 스타일/자재 검색 API 구현 | Completed |
| 31 | Phase 3 | 입고/잔량 조회 API 구현 | Completed |
| 32 | Phase 3 | API Request/Response 포맷 표준화 | Completed |
| 33 | Phase 3 | 프론트엔드 프리뷰 모달 UI/UX 설계 | Completed |
| 34 | Phase 3 | 프리뷰 데이터 그리드 구현 | Completed |
| 35 | Phase 3 | 데이터 검증 에러 시각화 UI 구현 | Completed |
| 36 | Phase 3 | 관리자 매핑 승인/재사용 UI 연동 | Completed |
| 37 | Phase 3 | 검색/조회용 필터링 UI 연동 | Completed |
| 38 | Phase 3 | 프론트엔드-백엔드 API 연동 최종 검증 | Completed |
| 39 | Phase 4 | 전체 파이프라인 통합 테스트 | Completed |
| 40 | Phase 4 | 엣지 케이스 및 예외 처리 테스트 | Completed |
| 41 | Phase 4 | 데이터 정합성 검증 테스트 | Completed |
| 42 | Phase 4 | 최종 결과 보고 및 문서화 마무리 | Completed |

---

## 📌 작업 수행 지침
- Gemini CLI는 새로운 작업 지시를 수행할 때마다 해당 STEP 번호를 확인하십시오.
- 작업 완료 시마다 본 `docs/data-mapping-roadmap.md` 파일의 해당 STEP **Status**를 'Completed'로 업데이트하십시오.
