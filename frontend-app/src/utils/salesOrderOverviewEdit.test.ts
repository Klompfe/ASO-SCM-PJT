import { describe, it, expect } from 'vitest';
import { updateOverviewField, resolveMaterialSubTypeCandidate, setBomItemSubType, prefillHandwrittenCmtDraft } from './salesOrderOverviewEdit';
import type { AiSalesOrderResult } from '../api/salesOrders.service';

const buildResult = (styleNo: string): AiSalesOrderResult => ({
  overview: {
    styleNo, styleName: null, itemType: null, brand: null, productionType: null,
    factory: null, buyer: null, totalQty: null, targetRdd: null, documentDate: null,
  },
  bomItems: [],
  sizeSpecs: [],
  workNotes: null,
});

describe('updateOverviewField (PR-158)', () => {
  it('지정한 index/field만 값이 바뀌고 다른 항목은 그대로 유지된다', () => {
    const results = [buildResult('A'), buildResult('B')];
    const next = updateOverviewField(results, 1, 'targetRdd', '2026-12-30');

    expect(next[0]).toBe(results[0]); // 건드리지 않은 항목은 참조까지 동일(불변 업데이트)
    expect(next[1].overview.targetRdd).toBe('2026-12-30');
    expect(next[1].overview.styleNo).toBe('B'); // 다른 필드는 그대로
  });

  it('원본 배열/객체를 변형하지 않는다(불변)', () => {
    const results = [buildResult('A')];
    const next = updateOverviewField(results, 0, 'buyer', '새 바이어');

    expect(results[0].overview.buyer).toBeNull(); // 원본 안 바뀜
    expect(next[0].overview.buyer).toBe('새 바이어');
    expect(next).not.toBe(results);
    expect(next[0]).not.toBe(results[0]);
  });

  it('총수량처럼 숫자 필드도 그대로 반영된다', () => {
    const results = [buildResult('A')];
    const next = updateOverviewField(results, 0, 'totalQty', 500);
    expect(next[0].overview.totalQty).toBe(500);
  });

  it('빈 문자열/삭제는 null로 반영할 수 있다', () => {
    const results = [{ ...buildResult('A'), overview: { ...buildResult('A').overview, buyer: '기존값' } }];
    const next = updateOverviewField(results, 0, 'buyer', null);
    expect(next[0].overview.buyer).toBeNull();
  });
});


describe('resolveMaterialSubTypeCandidate (PR-175)', () => {
  it('실 라벨은 threadType으로, 테이프 라벨은 tapeType으로 매핑된다', () => {
    expect(resolveMaterialSubTypeCandidate('코아사')).toEqual({ field: 'threadType', value: 'COA_SA' });
    expect(resolveMaterialSubTypeCandidate('오바사')).toEqual({ field: 'threadType', value: 'OBA_SA_SKU_I_SA' });
    expect(resolveMaterialSubTypeCandidate('지누이도')).toEqual({ field: 'threadType', value: 'POLY_JINUIDO' });
    expect(resolveMaterialSubTypeCandidate('다데')).toEqual({ field: 'tapeType', value: 'DADE' });
    expect(resolveMaterialSubTypeCandidate('암홀')).toEqual({ field: 'tapeType', value: 'AMHOL' });
  });

  it('후보가 없거나 모르는 라벨이면 null — 추측하지 않는다', () => {
    expect(resolveMaterialSubTypeCandidate(null)).toBeNull();
    expect(resolveMaterialSubTypeCandidate(undefined)).toBeNull();
    expect(resolveMaterialSubTypeCandidate('알수없음')).toBeNull();
  });
});

describe('setBomItemSubType (PR-175)', () => {
  const withBom = (): AiSalesOrderResult[] => [{
    ...buildResult('A'),
    bomItems: [
      { category: '부자재', itemName: '실', spec: null, colorCode: null, consumption: 1, requiredQty: null, supplier: null, remarks: null, materialSubTypeCandidate: '코아사', threadType: null, tapeType: null },
      { category: '부자재', itemName: '테이프', spec: null, colorCode: null, consumption: 1, requiredQty: null, supplier: null, remarks: null, materialSubTypeCandidate: null, threadType: null, tapeType: null },
    ],
  }];

  it('threadType을 고르면 해당 행에만 반영되고 tapeType은 비워진다', () => {
    const next = setBomItemSubType(withBom(), 0, 0, { field: 'threadType', value: 'COA_SA' });
    expect(next[0].bomItems[0]).toEqual(expect.objectContaining({ threadType: 'COA_SA', tapeType: null }));
    expect(next[0].bomItems[1].threadType).toBeNull(); // 다른 행은 그대로
  });

  it('tapeType을 고르면 threadType은 비워진다(한 자재에 실/테이프가 동시에 남지 않게)', () => {
    const start = setBomItemSubType(withBom(), 0, 0, { field: 'threadType', value: 'COA_SA' });
    const next = setBomItemSubType(start, 0, 0, { field: 'tapeType', value: 'AMHOL' });
    expect(next[0].bomItems[0]).toEqual(expect.objectContaining({ threadType: null, tapeType: 'AMHOL' }));
  });

  it('target이 null이면 둘 다 비운다(미지정으로 되돌림)', () => {
    const start = setBomItemSubType(withBom(), 0, 0, { field: 'threadType', value: 'COA_SA' });
    const next = setBomItemSubType(start, 0, 0, null);
    expect(next[0].bomItems[0]).toEqual(expect.objectContaining({ threadType: null, tapeType: null }));
  });

  it('AI 후보(materialSubTypeCandidate)만으로는 threadType/tapeType이 자동으로 채워지지 않는다', () => {
    const results = withBom();
    expect(results[0].bomItems[0].threadType).toBeNull();
    expect(results[0].bomItems[0].tapeType).toBeNull();
  });
});

// PR-181: 미도 작지 수기 CMT단가 초안을 입력란에 미리 채운다("사용" 버튼 단계 제거).
describe('prefillHandwrittenCmtDraft (PR-181)', () => {
  it('candidate가 있고 cmtPrice가 비어 있으면 입력란을 candidate로, 코멘트를 memo로 채운다', () => {
    const results = [{
      ...buildResult('A'),
      overview: { ...buildResult('A').overview, handwrittenCmtPriceCandidate: 7500, handwrittenCmtPriceMemo: '7,270 + 230 = 7,500', cmtPrice: null, cmtPriceNote: null },
    }];
    const next = prefillHandwrittenCmtDraft(results);
    expect(next[0].overview.cmtPrice).toBe(7500);
    expect(next[0].overview.cmtPriceNote).toBe('7,270 + 230 = 7,500');
  });

  it('memo가 없으면(식 없이 숫자만) 코멘트는 null로 둔다', () => {
    const results = [{
      ...buildResult('A'),
      overview: { ...buildResult('A').overview, handwrittenCmtPriceCandidate: 7500, handwrittenCmtPriceMemo: null, cmtPrice: null, cmtPriceNote: null },
    }];
    const next = prefillHandwrittenCmtDraft(results);
    expect(next[0].overview.cmtPrice).toBe(7500);
    expect(next[0].overview.cmtPriceNote).toBeNull();
  });

  it('cmtPrice에 이미 값이 있으면(사람이 이미 손댔거나 재분석) 덮어쓰지 않는다', () => {
    const results = [{
      ...buildResult('A'),
      overview: { ...buildResult('A').overview, handwrittenCmtPriceCandidate: 7500, handwrittenCmtPriceMemo: '7,500', cmtPrice: 9999, cmtPriceNote: '내가 직접 적은 코멘트' },
    }];
    const next = prefillHandwrittenCmtDraft(results);
    expect(next[0]).toBe(results[0]); // 변형 없이 그대로(참조 동일)
  });

  it('candidate가 없으면(미도가 아니거나 후보 없음) 건드리지 않는다', () => {
    const results = [buildResult('A')];
    const next = prefillHandwrittenCmtDraft(results);
    expect(next[0]).toBe(results[0]);
    expect(next[0].overview.cmtPrice ?? null).toBeNull();
  });
});
