# MERGE-50 — PR-245 main 반영 (고객사·공급업체 목록 텍스트 검색 + 등록 폼 중복 이름 안내)

- 병합 전 main `ea943e4` → 병합 후 main `0ac0c0e` (`feat/party-list-search`, fast-forward). 프런트 전용, 마이그레이션 없음, 백엔드 `src/`·package/lock 변경 0.
- 브랜치는 이미 최신 main 을 포함해(merge "Already up to date") 병합 커밋이 생기지 않았다.

## 테스트 (병합 직전 main 기준 측정 → 브랜치)
| | main(ea943e4) | 브랜치(0ac0c0e) | 하한 |
|---|---|---|---|
| 백엔드 jest | 1312 | 1312 통과 | 1312 |
| 프런트 vitest | 840 | 860 통과 (90 파일) | 860 |
| e2e (`--maxWorkers=2`) | 623 | 623 통과 (80 스위트) | 623 |
- `tsc -b`, 프런트 build, 백엔드 build 통과. 실패·재실행 없음. 작업 디렉터리는 대문자 `C:\dev\backend-api`.

## 변경 파일 (6개, 모두 `frontend-app/src/`)
`components/BuyersManager.tsx`, `components/SuppliersManager.tsx`, `components/PartySearchBar.tsx`(신규), `components/PartySearchBar.test.tsx`(신규), `utils/partySearch.ts`(신규), `utils/partySearch.test.ts`(신규).

## Gate A 확인
1. 두 화면 모두 `utils/partySearch.ts` 의 `filterByText` 를 사용(고객사 `buyerSearchFields`, 공급업체 `supplierSearchFields`). 규칙(앞뒤 공백 제거·대소문자 무시·연속 공백 무시·부분 일치)은 `normalizeSearchText` 와 테스트에 있다.
2. 빈 검색어(공백만 포함)는 같은 배열을 그대로 돌려줘 전체 목록이 보인다. 0건이면 "검색 결과가 없습니다. 검색어를 지우면 전체 목록이 보입니다" + 초기화 버튼, 건수는 "전체 N건"/"전체 N건 중 M건".
3. 검색 필드 — 고객사: 고객사명·코드·브랜드약칭·담당자·연락처·이메일·국가·주소 / 공급업체: 이름·코드·업체약칭·사업자번호·연락처·이메일·주소·취급 품목군 이름. 비밀번호·토큰 등 민감 필드 없음(diff grep 0건).
4. 공급업체 품목군 필터는 기존 서버 쿼리 그대로이며 텍스트 검색은 그 결과에 화면에서 AND 적용(테스트로 확인).
5. "이미 등록된 이름입니다"는 안내 문구만 표시한다 — 등록 버튼 `disabled`·`return` 차단 코드 없음. 정규화(공백·대소문자) 일치 기준이며 부분 일치는 중복이 아니다.
6. **추가 호출**: 검색 입력은 화면 필터만 하며 서버 호출이 없다. 공급업체에서 품목군 필터를 켠 경우에만 `loadSuppliers` 안에서 전체 목록 `GET /suppliers`(읽기 전용) 1회를 더 받는다 — 호출 시점은 화면 진입 시(필터가 켜져 있을 때), 품목군 필터를 바꿀 때, 등록·수정·삭제 후 재조회할 때이며, 검색어 키 입력마다는 호출되지 않는다(검색어는 별도 state).
7. 등록·수정·삭제 동작, 정렬 순서, PR-241/242 공급업체 드롭다운 로직 변경 없음(diff 는 검색 관련 추가와 `buyers.map`→`visibleBuyers.map`, `suppliers.map`→`visibleSuppliers.map` 뿐).
8. Gemini 호출·마이그레이션·새 의존성·브라우저 저장소 사용 없음.

## 한계
서버가 이름 중복을 막지 않아 동시 등록은 막지 못한다(중복 안내는 화면 안내). 품목군 필터를 적용하면 "전체 N건"은 그 필터 기준 건수다. 연락처는 하이픈 포함 그대로 부분 일치한다(숫자만 입력하면 하이픈 번호와 맞지 않음). jsdom 이 없어 입력 상호작용은 순수 함수·정적 렌더로만 검증했다(실제 입력은 수동 확인).

## 롤백
머지 커밋 revert(force-push 금지). 마이그레이션 없음.
