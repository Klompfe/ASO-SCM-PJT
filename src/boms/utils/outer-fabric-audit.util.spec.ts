import { buildOuterFabricAudit, type AuditBomInput, type AuditItemInput, type AuditStyleInput } from './outer-fabric-audit.util';

// PR-256: 겉감 혼용률 점검 계산(합성 데이터). 스타일 번호·자재명은 모두 가상 값.
const styles = (...nos: string[]): AuditStyleInput[] => nos.map((styleNo) => ({ styleNo, styleName: `이름-${styleNo}` }));
const bom = (id: number, styleNo: string, isActive: unknown = true): AuditBomInput => ({ id, styleNo, isActive });
const row = (bomId: number, category: unknown, composition: unknown): AuditItemInput => ({ bomId, category, composition });

describe('buildOuterFabricAudit (PR-256)', () => {
  it('겉감 행이 없으면 noRow, 안감·부자재만 있어도 noRow', () => {
    const r = buildOuterFabricAudit(styles('A'), [bom(1, 'A')], [row(1, '안감', 'P 100%'), row(1, 'EDGE TAPE', null)]);
    expect(r.items).toEqual([{ styleNo: 'A', styleName: '이름-A', status: 'noRow', outerRowCount: 0, blankOuterRows: 0, totalRows: 2, categories: ['EDGE TAPE', '안감'] }]);
  });

  it('겉감 행은 있고 혼용률이 비어 있거나 공백이면 blank', () => {
    for (const comp of [null, undefined, '', '   ', 5]) {
      const r = buildOuterFabricAudit(styles('A'), [bom(1, 'A')], [row(1, '겉감', comp)]);
      expect(r.items[0]).toMatchObject({ status: 'blank', outerRowCount: 1, blankOuterRows: 1 });
    }
  });

  it('겉감 행이 여러 개일 때 하나만 비어도 blank, 모두 채워지면 목록에서 제외', () => {
    const partial = buildOuterFabricAudit(styles('A'), [bom(1, 'A')], [row(1, '겉감', 'W 100%'), row(1, '겉감 OUT-SHELL', null)]);
    expect(partial.items[0]).toMatchObject({ status: 'blank', outerRowCount: 2, blankOuterRows: 1 });
    const full = buildOuterFabricAudit(styles('A'), [bom(1, 'A')], [row(1, '겉감', 'W 100%'), row(1, 'OUT SHELL', 'N 100%')]);
    expect(full.items).toEqual([]);
    expect(full.counts.total).toBe(0);
    expect(full.styleCount).toBe(1);
  });

  it('BOM 이 없거나 BOM 행이 0개인 스타일은 noBom 으로 따로 표기', () => {
    const r = buildOuterFabricAudit(styles('A', 'B'), [bom(2, 'B')], []);
    expect(r.items.map((i) => [i.styleNo, i.status, i.totalRows])).toEqual([['A', 'noBom', 0], ['B', 'noBom', 0]]);
    expect(r.counts).toEqual({ noBom: 2, noRow: 0, blank: 0, total: 2 });
  });

  it('FABRIC 같은 비표준 구분은 noRow 로 잡히고 구분 값 목록에 나타난다', () => {
    const r = buildOuterFabricAudit(styles('A'), [bom(1, 'A')], [row(1, 'FABRIC', 'W 100%'), row(1, '심 지\r\nINTERLINING', null)]);
    expect(r.items[0].status).toBe('noRow');
    expect(r.items[0].categories).toEqual(['FABRIC', '심 지 INTERLINING']);
  });

  it('INTERLINING 만 있는 스타일은 겉감 없음(별칭은 단어 경계)', () => {
    expect(buildOuterFabricAudit(styles('A'), [bom(1, 'A')], [row(1, 'INTERLINING', 'X')]).items[0].status).toBe('noRow');
  });

  it('이상 값(구분이 문자열이 아님·BOM 의 스타일이 없음)은 누락 쪽으로 둔다', () => {
    const r = buildOuterFabricAudit(styles('A'), [bom(1, 'A')], [row(1, null, 'X'), row(1, 42, 'X')]);
    expect(r.items[0].status).toBe('noRow');
    const orphan = buildOuterFabricAudit(styles('A'), [{ id: 9, styleNo: '', isActive: true }], [row(9, '겉감', 'W')]);
    expect(orphan.items[0].status).toBe('noBom');
  });

  it('스타일에 BOM 이 여럿이면 화면과 같은 활성 BOM(활성 중 id 최대) 기준, SQLite 의 0/1 불리언도 처리', () => {
    const boms = [bom(1, 'A', 1), bom(2, 'A', 0)];
    const items = [row(1, '겉감', 'W 100%'), row(2, '안감', 'P')];
    expect(buildOuterFabricAudit(styles('A'), boms, items).items).toEqual([]); // 활성(1)은 겉감 채움
    expect(buildOuterFabricAudit(styles('A'), [bom(1, 'A', false), bom(2, 'A', false)], items).items[0].status).toBe('noRow'); // 모두 비활성이면 id 최대(2)
  });

  it('상태 필터·검색·상태별 개수·정렬(noRow → blank → noBom, 스타일 번호순)', () => {
    const st = styles('D', 'C', 'B', 'A');
    const boms = [bom(1, 'A'), bom(2, 'B'), bom(3, 'C')];
    const items = [row(1, '안감', 'x'), row(2, '겉감', ''), row(3, '겉감', 'ok')];
    const all = buildOuterFabricAudit(st, boms, items);
    expect(all.items.map((i) => `${i.styleNo}:${i.status}`)).toEqual(['A:noRow', 'B:blank', 'D:noBom']);
    expect(all.counts).toEqual({ noBom: 1, noRow: 1, blank: 1, total: 3 });
    expect(buildOuterFabricAudit(st, boms, items, { status: 'blank' }).items.map((i) => i.styleNo)).toEqual(['B']);
    const searched = buildOuterFabricAudit(st, boms, items, { q: '이름-b', status: 'noRow' });
    expect(searched.total).toBe(0);
    expect(searched.counts).toEqual({ noBom: 0, noRow: 0, blank: 1, total: 1 }); // 개수는 검색어만 적용
  });

  it('페이지 크기 상한(200)·하한, 페이지 잘라내기, 총 개수', () => {
    const many = Array.from({ length: 5 }, (_, i) => `S${i}`);
    const r = buildOuterFabricAudit(styles(...many), [], [], { page: 2, pageSize: 2 });
    expect(r.items.map((i) => i.styleNo)).toEqual(['S2', 'S3']);
    expect(r.total).toBe(5);
    expect(buildOuterFabricAudit(styles(...many), [], [], { pageSize: 9999 }).pageSize).toBe(200);
    expect(buildOuterFabricAudit(styles(...many), [], [], { pageSize: 0, page: -3 })).toMatchObject({ pageSize: 50, page: 1 });
  });
});
