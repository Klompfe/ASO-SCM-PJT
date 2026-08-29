# Data Dictionary (Misense Material List)

## [Step 1: Raw Excel Analysis]
*Source: MBS6YSLM113Z.csv*

| 컬럼명(Raw) | 샘플 데이터 1 | 표준 도메인 | 상태/플래그 | 비고 |
| :--- | :--- | :--- | :--- | :--- |
| STYLE NO | MB6YSLM113Z | StyleNo | - | 메타데이터 |
| QTY | 2288 | Quantity | - | 메타데이터 |
| FACTORY | 베트남 | FactoryName | NEW_MASTER_CANDIDATE | 확인 필요 |
| BUYER | 미도컴퍼니 | BuyerName | NEW_MASTER_CANDIDATE | 확인 필요 |
| CLOOR/SIZE | BR | MaterialColor | - | - |
| 55 | 311 | Size | - | 동적 컬럼 |
| 66.0 | 360.0 | Size | - | 동적 컬럼 |
| 77.0 | 120.0 | Size | - | 동적 컬럼 |
| TOTAL | 791 | Consumption | - | 합계(검증용) |

## [Step 2: Business Meaning]
| 컬럼명(Raw) | SCM 업무적 의미 | 상태/플래그 | 비고 |
| :--- | :--- | :--- | :--- |
| STYLE NO | 스타일 번호 | - | - |
| QTY | 총 생산 수량 | - | - |
| FACTORY | 생산 공장 | NEW_MASTER_CANDIDATE | 마스터 매핑 필요 |
| BUYER | 바이어 | NEW_MASTER_CANDIDATE | 마스터 매핑 필요 |
| CLOOR/SIZE | 자재 컬러 | - | - |
| 55, 66.0, 77.0 | 사이즈 | - | - |

## [Step 3: Data Dictionary Definition]
| 표준 용어(Term) | 표준 도메인 | 데이터 형식 | 상태/플래그 | 설명 |
| :--- | :--- | :--- | :--- | :--- |
| StyleNo | 스타일 번호 | string | - | 제품 고유 코드 |
| Quantity | 생산 수량 | number | - | 총 수량 |
| FactoryName | 공장명 | string | NEW_MASTER_CANDIDATE | 생산처 식별 |
| BuyerName | 바이어명 | string | NEW_MASTER_CANDIDATE | 고객사 식별 |
| MaterialColor | 자재 컬러 | string | - | 색상 구분 |
| Size | 사이즈 | string | - | 규격 |
| Consumption | 소요량 | number | - | 사이즈별 투입량 |
