import { describe, it, expect } from 'vitest';
import {
  updateBomItemField,
  buildCommitBomItems,
  buildCommitResult,
  hasBlankMaterialName,
  normalizeMaterialName,
  isNewMaterialName,
  hasRequiredQtyMismatch,
  groupBomItemsForYocheok,
  hasRequiredQtyBundleMismatch,
  computeDuplicateLookingRows,
  computeBomRowBadges,
  handwrittenCandidateToBomItem,
  appendBomItemFromCandidate,
  updateHandwrittenCandidateField,
  appendBomItem,
  createEmptyBomItem,
  removeBomItem,
  shiftIndexesAfterRemoval,
  suggestConsumptionFromSheetQty,
} from './salesOrderBomReview';
import type { AiBomItem, AiHandwrittenCandidate, AiSalesOrderResult } from '../api/salesOrders.service';

const bomItem = (overrides: Partial<AiBomItem> = {}): AiBomItem => ({
  category: '부자재', itemName: '자재', spec: null, colorCode: null, consumption: 1,
  requiredQty: null, supplier: null, remarks: null, ...overrides,
});

const buildResult = (bomItems: AiBomItem[]): AiSalesOrderResult => ({
  overview: {
    styleNo: 'S', styleName: null, itemType: null, brand: null, productionType: null,
    factory: null, buyer: null, totalQty: 100, targetRdd: null, documentDate: null,
  },
  bomItems,
  sizeSpecs: [],
  workNotes: null,
});

describe('updateBomItemField (PR-197)', () => {
  it('지정한 행의 필드만 바뀌고 다른 행/결과는 그대로다', () => {
    const results = [buildResult([bomItem({ itemName: 'A' }), bomItem({ itemName: 'B' })])];
    const next = updateBomItemField(results, 0, 1, 'itemName', 'B-수정');
    expect(next[0].bomItems[0].itemName).toBe('A');
    expect(next[0].bomItems[1].itemName).toBe('B-수정');
    expect(next).not.toBe(results);
  });

  it('소요량(consumption)도 수정할 수 있다', () => {
    const results = [buildResult([bomItem({ consumption: 2.7 })])];
    const next = updateBomItemField(results, 0, 0, 'consumption', 2.9);
    expect(next[0].bomItems[0].consumption).toBe(2.9);
  });
});

describe('buildCommitBomItems / buildCommitResult (PR-197) — 제외 체크된 행은 저장 요청에서 빠진다', () => {
  it('제외된 인덱스는 결과 배열에서 빠진다', () => {
    const items = [bomItem({ itemName: 'A' }), bomItem({ itemName: 'B' }), bomItem({ itemName: 'C' })];
    const result = buildCommitBomItems(items, new Set([1]));
    expect(result.map((i) => i.itemName)).toEqual(['A', 'C']);
  });

  it('제외 해제하면(빈 Set) 전부 그대로 포함된다(복원)', () => {
    const items = [bomItem({ itemName: 'A' }), bomItem({ itemName: 'B' })];
    expect(buildCommitBomItems(items, new Set())).toHaveLength(2);
  });

  it('buildCommitResult는 overview 등 다른 필드는 그대로 두고 bomItems만 거른다', () => {
    const result = buildResult([bomItem({ itemName: 'A' }), bomItem({ itemName: 'B' })]);
    const committed = buildCommitResult(result, new Set([0]));
    expect(committed.bomItems.map((i) => i.itemName)).toEqual(['B']);
    expect(committed.overview.styleNo).toBe('S');
  });

  // PR-223: 저장 요청은 수기 메모 후보를 받지 않는다 — 처리 여부와 무관하게 항상 제외.
  it('buildCommitResult는 handwrittenCandidates를 저장 요청에서 제외한다', () => {
    const result: AiSalesOrderResult = {
      ...buildResult([bomItem({ itemName: 'A' })]),
      handwrittenCandidates: [{ rawText: '금속장식', name: '금속장식', spec: null, color: null, consumption: null, requiredQty: null, requiredQtyUnit: null, locationHint: null }],
    };
    const committed = buildCommitResult(result, new Set());
    expect(committed).not.toHaveProperty('handwrittenCandidates');
  });

  // PR-226: requiredQtyLots(LOT별 숫자, 표시용)는 저장 대상이 아니다 — requiredQty
  // (서버가 이미 합산한 값)만 저장한다.
  it('buildCommitResult는 각 bomItem의 requiredQtyLots를 저장 요청에서 제외한다', () => {
    const result = buildResult([bomItem({ itemName: 'A', requiredQty: 758, requiredQtyLots: [499, 259] })]);
    const committed = buildCommitResult(result, new Set());
    expect(committed.bomItems[0]).not.toHaveProperty('requiredQtyLots');
    expect(committed.bomItems[0].requiredQty).toBe(758); // requiredQty 자체는 그대로 남는다
  });
});

// PR-223(PILOT-21 설계안): 수기 메모 후보 → 일반 자재 행 변환(합성 값만 사용).
describe('handwrittenCandidateToBomItem / appendBomItemFromCandidate (PR-223)', () => {
  const candidate = (overrides: Partial<AiHandwrittenCandidate> = {}): AiHandwrittenCandidate => ({
    rawText: '금속장식 (내경 10φ)', name: '금속장식', spec: '내경 10φ', color: null,
    consumption: null, requiredQty: null, requiredQtyUnit: null, locationHint: '하단 여백', ...overrides,
  });

  it('name이 있으면 자재명으로 쓰고, 나머지 필드도 그대로 옮긴다', () => {
    const item = handwrittenCandidateToBomItem(candidate({ color: 'BL', consumption: 1.2, requiredQty: 10, requiredQtyUnit: 'EA' }));
    expect(item).toMatchObject({ itemName: '금속장식', spec: '내경 10φ', colorCode: 'BL', consumption: 1.2, requiredQty: 10, requiredQtyUnit: 'EA' });
  });

  it('name이 null이면 rawText를 자재명으로 쓴다(빈 자재명 방지)', () => {
    const item = handwrittenCandidateToBomItem(candidate({ name: null, rawText: 'BE-WH…' }));
    expect(item.itemName).toBe('BE-WH…');
  });

  // PR-228 원인 규명: 후보 입력칸에는 "수량"(requiredQty) 하나만 있고 요척(consumption)
  // 입력칸은 없다 — 수량만 있는 후보를 변환해도 수량이 요척에 복사되지 않고 요척은
  // 비어 있는 채로 남는다(사용자 보고 사례의 원인이 이 매핑 쪽 코드 버그가 아님을 확인).
  it('수량(requiredQty)만 있는 후보는 requiredQty에만 들어가고 요척(consumption)은 비어 있다', () => {
    const item = handwrittenCandidateToBomItem(candidate({ requiredQty: 499, requiredQtyUnit: 'EA' }));
    expect(item.requiredQty).toBe(499);
    expect(item.consumption).toBeNull();
  });

  it('요척이 명시된 후보는 요척이 그대로 들어간다', () => {
    const item = handwrittenCandidateToBomItem(candidate({ consumption: 1.2, requiredQty: 10 }));
    expect(item.consumption).toBe(1.2);
    expect(item.requiredQty).toBe(10);
  });

  it('수량/요척이 없는 후보는 자동으로 숫자를 만들어 넣지 않는다(비어 있음)', () => {
    const item = handwrittenCandidateToBomItem(candidate());
    expect(item.consumption).toBeNull();
    expect(item.requiredQty).toBeNull();
  });

  it('appendBomItemFromCandidate는 그 결과의 bomItems 끝에 행을 추가하고 새 인덱스를 돌려준다', () => {
    const results = [buildResult([bomItem({ itemName: 'A' })])];
    const { results: next, newBomIndex } = appendBomItemFromCandidate(results, 0, candidate());
    expect(newBomIndex).toBe(1);
    expect(next[0].bomItems.map((i) => i.itemName)).toEqual(['A', '금속장식']);
    // 다른 결과/원본은 그대로(불변).
    expect(results[0].bomItems).toHaveLength(1);
  });

  it('updateHandwrittenCandidateField는 "자재 행으로 추가" 전에 후보 필드를 고칠 수 있게 한다', () => {
    const results: AiSalesOrderResult[] = [{ ...buildResult([]), handwrittenCandidates: [candidate(), candidate({ rawText: '다른 후보' })] }];
    const next = updateHandwrittenCandidateField(results, 0, 0, 'name', '교정된 자재명');
    expect(next[0].handwrittenCandidates?.[0].name).toBe('교정된 자재명');
    expect(next[0].handwrittenCandidates?.[1].rawText).toBe('다른 후보'); // 다른 후보는 그대로
  });
});

describe('hasBlankMaterialName (PR-197) — 자재명을 비우면 저장 불가', () => {
  it('자재명이 비어 있으면(공백만 포함) true', () => {
    expect(hasBlankMaterialName([bomItem({ itemName: '' }), bomItem({ itemName: 'A' })])).toBe(true);
    expect(hasBlankMaterialName([bomItem({ itemName: '   ' })])).toBe(true);
  });

  it('전부 채워져 있으면 false', () => {
    expect(hasBlankMaterialName([bomItem({ itemName: 'A' }), bomItem({ itemName: 'B' })])).toBe(false);
  });

  it('제외된 행을 먼저 거른 뒤 검사하면 빈 이름이 제외돼 통과한다', () => {
    const items = [bomItem({ itemName: '' }), bomItem({ itemName: 'B' })];
    const filtered = buildCommitBomItems(items, new Set([0]));
    expect(hasBlankMaterialName(filtered)).toBe(false);
  });
});

describe('normalizeMaterialName / isNewMaterialName (PR-197)', () => {
  it('공백·대소문자를 무시하고 비교한다', () => {
    expect(normalizeMaterialName('  스판사   테스트  ')).toBe('스판사 테스트');
    expect(normalizeMaterialName('ABC')).toBe('abc');
  });

  it('자재 마스터에 있으면(정규화 후 일치) 새 이름이 아니다', () => {
    const existing = new Set([normalizeMaterialName('스쿠이사')]);
    expect(isNewMaterialName('스쿠이사', existing)).toBe(false);
    expect(isNewMaterialName(' 스쿠이사 ', existing)).toBe(false);
  });

  it('자재 마스터에 없으면 새 이름이다', () => {
    const existing = new Set([normalizeMaterialName('스쿠이사')]);
    expect(isNewMaterialName('스팽사', existing)).toBe(true);
  });

  it('이름이 비어 있으면 새 이름으로 보지 않는다(저장 불가는 별도 처리)', () => {
    expect(isNewMaterialName('', new Set())).toBe(false);
    expect(isNewMaterialName(null, new Set())).toBe(false);
  });
});

describe('hasRequiredQtyMismatch (PR-197) — 요척 오인식 교차검증(값은 바꾸지 않음)', () => {
  it('요척 2.7 × 총수량 980 = 2,646인데 requiredQty가 2,842로 다르면(7.4% 차이) 의심 표시', () => {
    expect(hasRequiredQtyMismatch({ consumption: 2.7, requiredQty: 2842 }, 980)).toBe(true);
  });

  it('값이 1% 이내로 같으면 의심하지 않는다', () => {
    expect(hasRequiredQtyMismatch({ consumption: 2.7, requiredQty: 2646 }, 980)).toBe(false);
  });

  it('requiredQty를 AI가 못 읽었으면(null) 비교하지 않는다', () => {
    expect(hasRequiredQtyMismatch({ consumption: 2.7, requiredQty: null }, 980)).toBe(false);
  });

  it('총수량이 없으면 비교하지 않는다', () => {
    expect(hasRequiredQtyMismatch({ consumption: 2.7, requiredQty: 2842 }, null)).toBe(false);
  });
});

// PR-201(운영 화면 확인): 같은 겉감 자재가 색상별로 행이 나뉘어 있으면 출고량도
// 색상별 값이라 행 하나씩 비교하면 오탐이 난다 — 백엔드 vision-guardrails.util.ts와
// 같은 규칙(구분+자재명(공백 제거·대소문자 무시)+요척)을 프런트에도 둔다. 숫자는 전부
// 익명 합성값.
describe('groupBomItemsForYocheok (PR-201)', () => {
  it('⑥ 자재명이 공백·대소문자만 다르면 같은 묶음', () => {
    const items = [
      bomItem({ itemName: ' code-a ', consumption: 1.2 }),
      bomItem({ itemName: 'CODE-A', consumption: 1.2 }),
    ];
    expect(groupBomItemsForYocheok(items)).toEqual([[0, 1]]);
  });

  it('⑦ 이름이 같아도 요척이 다르면 다른 묶음', () => {
    const items = [
      bomItem({ itemName: 'CODE-A', consumption: 1.2 }),
      bomItem({ itemName: 'CODE-A', consumption: 1.3 }),
    ];
    expect(groupBomItemsForYocheok(items).filter((g) => g.length > 1)).toEqual([]);
  });
});

describe('hasRequiredQtyBundleMismatch (PR-201) — 익명 합성값', () => {
  it('① 두 색상 행(요척1.00, 총수량1000, 출고량400/600) — 합이 맞으면 false', () => {
    const items = [bomItem({ consumption: 1.0, requiredQty: 400 }), bomItem({ consumption: 1.0, requiredQty: 600 })];
    expect(hasRequiredQtyBundleMismatch(items, 1000)).toBe(false);
  });

  it('② 요척1.20·총수량1000·출고량400/600(합1000=총수량, 기대값1200) — true(벌 수 의심이어도 뱃지는 뜬다)', () => {
    const items = [bomItem({ consumption: 1.2, requiredQty: 400 }), bomItem({ consumption: 1.2, requiredQty: 600 })];
    expect(hasRequiredQtyBundleMismatch(items, 1000)).toBe(true);
  });

  it('③ 합이 크게 다르면 true', () => {
    const items = [bomItem({ consumption: 1.0, requiredQty: 100 }), bomItem({ consumption: 1.0, requiredQty: 100 })];
    expect(hasRequiredQtyBundleMismatch(items, 1000)).toBe(true);
  });

  it('④ 묶음 안에 requiredQty가 null인 행이 하나라도 있으면 false', () => {
    const items = [bomItem({ consumption: 1.2, requiredQty: 400 }), bomItem({ consumption: 1.2, requiredQty: null })];
    expect(hasRequiredQtyBundleMismatch(items, 1000)).toBe(false);
  });

  it('⑨ 3색 묶음(710/710/810 구조와 같은 비율의 임의 숫자)이 허용 오차 안에서 false', () => {
    const items = [
      bomItem({ consumption: 1.0, requiredQty: 318 }),
      bomItem({ consumption: 1.0, requiredQty: 318 }),
      bomItem({ consumption: 1.0, requiredQty: 364 }),
    ];
    expect(hasRequiredQtyBundleMismatch(items, 1000)).toBe(false);
  });
});

describe('computeBomRowBadges (PR-201) — 다색 묶음은 합으로, 단일 행은 기존대로', () => {
  it('⑤ 단일 행의 기존 동작은 바뀌지 않는다(요척 오인식 사례, PR-197 그대로)', () => {
    const items = [bomItem({ itemName: '단일자재', category: 'Y', consumption: 2.7, requiredQty: 2842 })];
    const badges = computeBomRowBadges(items, 980, new Set());
    expect(badges[0].requiredQtyMismatch).toBe(true);
  });

  it('⑧ 다색 묶음(요척·이름 같음, 2행)은 합으로 판정하고 개별 행 오탐을 없앤다', () => {
    // 실사례 구조(요척 1.19, 색상 2행 출고량 760/825, 합 1585 ≈ 요척×수량)를 익명화.
    const items = [
      bomItem({ itemName: '겉감자재', category: '겉감', consumption: 1.19, requiredQty: 760, colorCode: 'CR' }),
      bomItem({ itemName: '겉감자재', category: '겉감', consumption: 1.19, requiredQty: 825, colorCode: 'BL' }),
    ];
    const totalQty = Math.round(1585 / 1.19); // 요척×수량 ≈ 합(1585)이 되는 총수량
    const badges = computeBomRowBadges(items, totalQty, new Set());
    expect(badges[0].requiredQtyMismatch).toBe(false);
    expect(badges[1].requiredQtyMismatch).toBe(false);
  });
});

describe('computeDuplicateLookingRows (PR-197) — 스쿠이사·스판사·스팽사 19,600 사례(익명 데이터로 재현)', () => {
  it('같은 구분 안에서 소요량이 완전히 같은 행이 3개 이상이면 전부 표시한다', () => {
    const items = [
      bomItem({ itemName: '스쿠이사', category: '부자재', consumption: 19600 }),
      bomItem({ itemName: '스판사', category: '부자재', consumption: 19600 }),
      bomItem({ itemName: '스팽사', category: '부자재', consumption: 19600 }),
      bomItem({ itemName: '다른자재', category: '부자재', consumption: 500 }),
    ];
    expect(computeDuplicateLookingRows(items)).toEqual([true, true, true, false]);
  });

  it('이름만 다르고 규격·소요량이 모두 같은 행(2개)도 표시한다', () => {
    const items = [
      bomItem({ itemName: '다데', category: 'X', spec: '50M', consumption: 2646 }),
      bomItem({ itemName: '다이렉트선', category: 'Y', spec: '50M', consumption: 2646 }),
    ];
    expect(computeDuplicateLookingRows(items)).toEqual([true, true]);
  });

  it('이름까지 완전히 같은 단순 반복 행은(2개뿐이면) 표시하지 않는다 — 이 배지는 "이름이 다른데 값이 같은" 경우만', () => {
    const items = [
      bomItem({ itemName: '같은자재', category: 'X', spec: '50M', consumption: 100 }),
      bomItem({ itemName: '같은자재', category: 'X', spec: '50M', consumption: 100 }),
    ];
    expect(computeDuplicateLookingRows(items)).toEqual([false, false]);
  });

  it('소요량이 다르면 표시하지 않는다', () => {
    const items = [
      bomItem({ itemName: 'A', category: 'X', consumption: 100 }),
      bomItem({ itemName: 'B', category: 'X', consumption: 200 }),
    ];
    expect(computeDuplicateLookingRows(items)).toEqual([false, false]);
  });
});

describe('computeBomRowBadges (PR-197) — 통합', () => {
  it('세 배지를 행마다 계산해 돌려준다', () => {
    const items = [
      bomItem({ itemName: '스쿠이사', category: 'X', consumption: 19600, requiredQty: 19600 }),
      bomItem({ itemName: '스판사', category: 'X', consumption: 19600, requiredQty: 19600 }),
      bomItem({ itemName: '스팽사', category: 'X', consumption: 19600, requiredQty: 19600 }),
    ];
    const existing = new Set([normalizeMaterialName('스쿠이사')]);
    const badges = computeBomRowBadges(items, 1, existing);
    expect(badges[0]).toEqual({ isNewMaterial: false, requiredQtyMismatch: false, duplicateLooking: true });
    expect(badges[1].isNewMaterial).toBe(true);
    expect(badges[2].isNewMaterial).toBe(true);
  });
});

// PR-225: "＋ 자재 행 직접 추가" — PR-223 appendBomItemFromCandidate와 같은 저장
// 경로(appendBomItem)를 공유한다(합성 값만 사용).
describe('createEmptyBomItem / appendBomItem (PR-225)', () => {
  it('createEmptyBomItem은 전부 비어 있는 행을 만든다', () => {
    const item = createEmptyBomItem();
    expect(item.itemName).toBe('');
    expect(item.category).toBeNull();
    expect(item.consumption).toBeNull();
    expect(item.requiredQty).toBeNull();
  });

  it('appendBomItem은 그 결과의 bomItems 끝에 행을 추가하고 새 인덱스를 돌려준다(원본은 불변)', () => {
    const results = [buildResult([bomItem({ itemName: 'A' })])];
    const { results: next, newBomIndex } = appendBomItem(results, 0, createEmptyBomItem());
    expect(newBomIndex).toBe(1);
    expect(next[0].bomItems).toHaveLength(2);
    expect(results[0].bomItems).toHaveLength(1);
  });

  it('appendBomItemFromCandidate는 appendBomItem과 같은 결과를 낸다(경로 공유 확인)', () => {
    const candidate: AiHandwrittenCandidate = {
      rawText: '금속장식', name: '금속장식', spec: null, color: null,
      consumption: null, requiredQty: null, requiredQtyUnit: null, locationHint: null,
    };
    const results = [buildResult([])];
    const viaCandidate = appendBomItemFromCandidate(results, 0, candidate);
    const viaDirect = appendBomItem(results, 0, handwrittenCandidateToBomItem(candidate));
    expect(viaCandidate.results[0].bomItems).toEqual(viaDirect.results[0].bomItems);
    expect(viaCandidate.newBomIndex).toBe(viaDirect.newBomIndex);
  });
});

describe('removeBomItem / shiftIndexesAfterRemoval (PR-225) — 직접 추가 행 삭제', () => {
  it('removeBomItem은 지정한 행만 배열에서 제거한다(원본 불변)', () => {
    const results = [buildResult([bomItem({ itemName: 'A' }), bomItem({ itemName: 'B' }), bomItem({ itemName: 'C' })])];
    const next = removeBomItem(results, 0, 1);
    expect(next[0].bomItems.map((i) => i.itemName)).toEqual(['A', 'C']);
    expect(results[0].bomItems).toHaveLength(3);
  });

  it('shiftIndexesAfterRemoval은 지워진 인덱스를 빼고 그 뒤 인덱스를 1씩 당긴다', () => {
    const indexes = new Set([0, 1, 2, 3]);
    const shifted = shiftIndexesAfterRemoval(indexes, 1);
    expect(shifted).toEqual(new Set([0, 1, 2])); // 1은 제거, 2→1, 3→2
  });

  it('지워진 인덱스보다 앞쪽 값은 그대로 유지된다', () => {
    const shifted = shiftIndexesAfterRemoval(new Set([0, 4]), 2);
    expect(shifted).toEqual(new Set([0, 3]));
  });

  it('빈 Set을 지워도 빈 Set이다', () => {
    expect(shiftIndexesAfterRemoval(new Set(), 0)).toEqual(new Set());
  });
});

// PR-228: 수기로 추가한 행(후보/직접 추가)에서 요척(consumption)이 비어 있을 때,
// 작지수량(requiredQty) ÷ 총수량으로 "개당 수량"을 제안한다 — 자동으로 넣지 않고
// 호출하는 쪽(SalesOrderUploadModal)이 버튼을 눌렀을 때만 적용한다(이 함수는 제안값만
// 계산한다).
describe('suggestConsumptionFromSheetQty (PR-228)', () => {
  it('작지수량 499·총수량 499·요척 빈칸 → 1.00을 제안한다', () => {
    expect(suggestConsumptionFromSheetQty({ consumption: null, requiredQty: 499 }, 499)).toBe(1);
  });

  it('소수 둘째 자리까지 반올림한다', () => {
    expect(suggestConsumptionFromSheetQty({ consumption: null, requiredQty: 100 }, 3)).toBeCloseTo(33.33, 2);
  });

  it('요척이 이미 있으면 제안하지 않는다(null)', () => {
    expect(suggestConsumptionFromSheetQty({ consumption: 1.2, requiredQty: 499 }, 499)).toBeNull();
  });

  it('작지수량이 없거나 0이면 제안하지 않는다', () => {
    expect(suggestConsumptionFromSheetQty({ consumption: null, requiredQty: null }, 499)).toBeNull();
    expect(suggestConsumptionFromSheetQty({ consumption: null, requiredQty: 0 }, 499)).toBeNull();
  });

  it('총수량이 없거나 0이면 제안하지 않는다(칩 없음)', () => {
    expect(suggestConsumptionFromSheetQty({ consumption: null, requiredQty: 499 }, null)).toBeNull();
    expect(suggestConsumptionFromSheetQty({ consumption: null, requiredQty: 499 }, 0)).toBeNull();
  });
});
