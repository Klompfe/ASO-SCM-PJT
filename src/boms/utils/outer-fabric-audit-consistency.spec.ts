import { InternalServerErrorException } from '@nestjs/common';
import { assertAuditInvariant, buildOuterFabricAudit, type AuditBomInput, type AuditItemInput, type AuditStyleInput } from './outer-fabric-audit.util';

// PR-262: 점검 응답 보강(overall·applied·generatedAt)과 불변식. 합성 데이터만.
const styles: AuditStyleInput[] = ['S1', 'S2', 'S3', 'S4', 'S5'].map((styleNo) => ({ styleNo, styleName: `이름-${styleNo}` }));
const boms: AuditBomInput[] = [1, 2, 3, 4].map((id) => ({ id, styleNo: `S${id}`, isActive: true }));
const rows: AuditItemInput[] = [
  { bomId: 1, category: '겉감', composition: 'X/Y=60/40' }, // S1 입력 완료
  { bomId: 2, category: '소재', composition: null }, // S2 blank (PR-261)
  { bomId: 3, category: '안감', composition: 'P' }, // S3 noRow
  // S4: BOM 은 있으나 행 0 → noBom, S5: BOM 없음 → noBom
];

describe('overall·applied·generatedAt (PR-262)', () => {
  it('① 불변식: 전체 = BOM 없음 + 겉감 행 없음 + 비어 있음 + 입력 완료', () => {
    const r = buildOuterFabricAudit(styles, boms, rows);
    expect(r.overall).toEqual({ total: 5, noBom: 2, noRow: 1, blank: 1, okCount: 1 });
    expect(r.overall.total).toBe(r.overall.noBom + r.overall.noRow + r.overall.blank + r.overall.okCount);
    expect(new Date(r.generatedAt).toISOString()).toBe(r.generatedAt);
  });

  it('② 맞는 것이 없는 검색어: overall 은 전체 기준 그대로, 기존 필드는 이전과 같다', () => {
    const r = buildOuterFabricAudit(styles, boms, rows, { q: 'zzz-없음' });
    expect(r.overall).toEqual({ total: 5, noBom: 2, noRow: 1, blank: 1, okCount: 1 });
    expect({ items: r.items, total: r.total, page: r.page, pageSize: r.pageSize, counts: r.counts, styleCount: r.styleCount }).toEqual({
      items: [], total: 0, page: 1, pageSize: 50, counts: { noBom: 0, noRow: 0, blank: 0, total: 0 }, styleCount: 5,
    });
  });

  it('② 상태 필터도 overall 에 영향이 없다', () => {
    expect(buildOuterFabricAudit(styles, boms, rows, { status: 'blank' }).overall).toEqual(buildOuterFabricAudit(styles, boms, rows).overall);
  });

  it('③ 불변식을 깨는 입력(같은 스타일이 두 번)은 오류 — 조용히 내보내지 않는다', () => {
    expect(() => buildOuterFabricAudit([...styles, styles[0]], boms, rows)).toThrow(InternalServerErrorException);
    expect(() => buildOuterFabricAudit([...styles, styles[0]], boms, rows)).toThrow('겉감 점검 계산이 서로 맞지 않아');
  });

  it.each([
    { total: 5, noBom: 0, noRow: 0, blank: 0, okCount: 0 },
    { total: 1, noBom: 1, noRow: 1, blank: 0, okCount: 0 },
    { total: 1, noBom: 2, noRow: -1, blank: 0, okCount: 0 },
    { total: 1.5, noBom: 1.5, noRow: 0, blank: 0, okCount: 0 },
    { total: Number.NaN, noBom: 0, noRow: 0, blank: 0, okCount: 0 },
  ])('③ assertAuditInvariant 는 %j 를 거부한다', (overall) => {
    expect(() => assertAuditInvariant(overall)).toThrow(InternalServerErrorException);
  });

  it('④ applied 는 정규화한 값이다(검색어 공백 제거, 상태 기본 all, 쪽·크기 한정)', () => {
    expect(buildOuterFabricAudit(styles, boms, rows).applied).toEqual({ q: '', status: 'all', page: 1, pageSize: 50 });
    expect(buildOuterFabricAudit(styles, boms, rows, { q: '  AbC  ', status: 'noRow', page: -2, pageSize: 9999 }).applied).toEqual({ q: 'AbC', status: 'noRow', page: 1, pageSize: 200 });
    expect(buildOuterFabricAudit(styles, boms, rows, { q: '   ' }).applied.q).toBe('');
  });

  it('⑤ 기존 응답 필드 이름은 그대로이고 새 필드 셋만 더해졌다', () => {
    expect(Object.keys(buildOuterFabricAudit(styles, boms, rows)).sort()).toEqual(['applied', 'counts', 'generatedAt', 'items', 'overall', 'page', 'pageSize', 'styleCount', 'total']);
  });

  it('스타일 0개: overall 전부 0 이고 오류가 아니다', () => {
    expect(buildOuterFabricAudit([], [], []).overall).toEqual({ total: 0, noBom: 0, noRow: 0, blank: 0, okCount: 0 });
  });
});
