import { judgeOuterFabricSupplement } from './outer-fabric-supplement.util';
import type { BomDiffExistingRow } from './bom-diff.util';

// PR-258: 겉감 보충 판정(순수 함수) — 합성 값만.
const live = (id: number, itemName: string, category: string | null, extra: Partial<BomDiffExistingRow> = {}): BomDiffExistingRow => ({
  bomItemId: id, itemName, category, colorCode: null, spec: null, consumption: 1, linkedPoCount: 0, ...extra,
});
const inc = (itemName: string, category: string | null, extra: Record<string, unknown> = {}) => ({ itemName, category, consumption: 1, ...extra });

// 정상 사례: 기존 3행(겉감 없음) + 입력 4행(같은 3행 + 겉감 1행).
const liveRows = () => [live(1, 'LIN-A', '안감'), live(2, 'THREAD-A', '실'), live(3, 'LABEL-A', '라벨')];
const goodIncoming = () => [inc('겉감 OUT-SHELL', '겉감\r\nOUT-SHELL'), inc('LIN-A', '안감'), inc('THREAD-A', '실'), inc('LABEL-A', '라벨')];
const judge = (over: Record<string, unknown> = {}) =>
  judgeOuterFabricSupplement({ styleNo: 'SYN-1', registered: true, liveRows: liveRows(), incomingRows: goodIncoming(), ...over } as never);

describe('judgeOuterFabricSupplement (PR-258)', () => {
  it('정상: 등록·BOM 있음·라이브 겉감 0·입력 겉감 1·나머지 모두 같음 → eligible, 추가할 행 인덱스를 돌려준다', () => {
    const r = judge();
    expect(r.eligible).toBe(true);
    expect(r.outerRowIndex).toBe(0);
    expect(r.reason).toBeUndefined();
    expect(r.info).toMatchObject({ liveOuterFabricRows: 0, existingRowCount: 3, sameCount: 3, newRowCount: 1, valueDiffCount: 0, onlyExistingCount: 0, similarPairCount: 0 });
  });

  it.each([
    ['미등록 스타일', { registered: false }, 'NOT_REGISTERED'],
    ['BOM 없음(활성 BOM 없음)', { liveRows: null }, 'NO_BOM'],
    ['BOM 행 0개(스텁)', { liveRows: [] }, 'NO_BOM'],
    ['이미 겉감 행이 있음(멱등)', { liveRows: [...liveRows(), live(9, '겉감 OUT-SHELL', '겉감 OUT-SHELL')] }, 'ALREADY_HAS_OUTER_FABRIC'],
    ['입력에 겉감 행이 없음', { incomingRows: goodIncoming().slice(1) }, 'NO_OUTER_FABRIC_ROW'],
    ['입력에 겉감 행이 2개', { incomingRows: [...goodIncoming(), inc('겉감 B', '겉감')] }, 'MULTIPLE_OUTER_FABRIC_ROWS'],
    ['겉감 행의 자재명이 비어 있음', { incomingRows: [inc('   ', '겉감'), ...goodIncoming().slice(1)] }, 'EMPTY_NAME'],
  ])('%s → %s', (_label, over, reason) => {
    const r = judge(over);
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe(reason);
    expect(r.message.length).toBeGreaterThan(0);
  });

  it('겉감 계열이 아닌 구분만 있는 입력(FABRIC·INTERLINING·안감·LINING)은 겉감 행으로 보지 않는다', () => {
    for (const c of ['FABRIC', 'INTERLINING', '심 지\r\nINTERLINING', '안감', 'LINING', '배색 COMBINATION']) {
      const r = judge({ incomingRows: [inc('소재', c), ...goodIncoming().slice(1)] });
      expect(r.reason).toBe('NO_OUTER_FABRIC_ROW');
    }
  });

  it('엉뚱한 엑셀 가드: 겉감 외에 새 행이 더 있으면 OTHER_CHANGES', () => {
    expect(judge({ incomingRows: [...goodIncoming(), inc('전혀다른자재', '부자재')] }).reason).toBe('OTHER_CHANGES');
  });

  it('엉뚱한 엑셀 가드: 같은 이름인데 요척이 다르면(값 다름) OTHER_CHANGES', () => {
    const incoming = goodIncoming();
    incoming[1] = inc('LIN-A', '안감', { consumption: 9 });
    expect(judge({ incomingRows: incoming }).reason).toBe('OTHER_CHANGES');
  });

  it('엉뚱한 엑셀 가드: 기존에만 있는 행이 있으면(입력에 기존 행이 빠짐) OTHER_CHANGES', () => {
    expect(judge({ incomingRows: goodIncoming().slice(0, 3) }).reason).toBe('OTHER_CHANGES');
  });

  it('겉감과 무관한 유사 짝은 정보로만 돌려주고 판정에는 영향이 없다(같음이 절반 이상일 때)', () => {
    const rows = [live(1, 'LIN-A', '안감'), live(2, 'THREAD-A', '실'), live(3, 'LABEL-A', '라벨'), live(4, 'TAG-A(면)', '택')];
    const incoming = [inc('겉감 OUT-SHELL', '겉감'), inc('LIN-A', '안감'), inc('THREAD-A', '실'), inc('LABEL-A', '라벨'), inc('TAG-A', '택')];
    const r = judgeOuterFabricSupplement({ styleNo: 'SYN-1', registered: true, liveRows: rows, incomingRows: incoming });
    expect(r.eligible).toBe(true);
    expect(r.info).toMatchObject({ sameCount: 3, similarPairCount: 1 });
  });

  it('같음이 기존 행의 절반 미만이면(대부분 유사 짝) 엉뚱한 파일로 보고 OTHER_CHANGES', () => {
    const rows = [live(1, 'A-A(면)', '택'), live(2, 'B-B(면)', '택2'), live(3, 'C-C(면)', '택3')];
    const incoming = [inc('겉감', '겉감'), inc('A-A', '택'), inc('B-B', '택2'), inc('C-C', '택3')];
    const r = judgeOuterFabricSupplement({ styleNo: 'S', registered: true, liveRows: rows, incomingRows: incoming });
    expect(r.reason).toBe('OTHER_CHANGES');
    expect(r.info.similarPairCount).toBe(3);
  });

  it('이상 입력은 fail-closed: INVALID_INPUT', () => {
    for (const over of [
      { styleNo: '' }, { styleNo: null }, { styleNo: 42 },
      { incomingRows: undefined }, { incomingRows: null }, { incomingRows: 'x' }, { incomingRows: [] },
      { incomingRows: [null] }, { incomingRows: [{ category: '겉감' }] }, { incomingRows: [{ itemName: 5, category: '겉감' }] },
    ]) {
      const r = judge(over);
      expect(r.eligible).toBe(false);
      expect(r.reason).toBe('INVALID_INPUT');
    }
  });

  it('입력 형식이 맞아도 구분이 문자열이 아니면(숫자·null) 겉감으로 취급하지 않는다', () => {
    const r = judge({ incomingRows: [inc('겉감A', 42 as unknown as string), ...goodIncoming().slice(1)] });
    expect(r.reason).toBe('NO_OUTER_FABRIC_ROW');
  });
});
