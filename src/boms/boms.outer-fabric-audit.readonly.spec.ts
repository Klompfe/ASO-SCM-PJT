import { BomsService } from './boms.service';

// PR-256: 점검 조회가 읽기 전용임을 mock 으로 확인한다 — 쓰기·원시 쿼리 메서드가 호출되면 실패한다.
describe('BomsService.findOuterFabricAudit — 읽기 전용 (PR-256)', () => {
  const WRITE_METHODS = ['save', 'insert', 'update', 'delete', 'remove', 'softDelete', 'upsert', 'query', 'execute', 'increment', 'decrement'];

  function qb(raw: unknown[], calls: string[]) {
    const chain: any = {};
    for (const m of ['leftJoin', 'select', 'where', 'andWhere', 'orderBy']) chain[m] = (..._a: unknown[]) => { calls.push(m); return chain; };
    chain.getRawMany = async () => { calls.push('getRawMany'); return raw; };
    for (const m of WRITE_METHODS) chain[m] = () => { throw new Error(`쓰기 호출 금지: ${m}`); };
    return chain;
  }
  const guardedRepo = (raw: unknown[], calls: string[]) => {
    const repo: any = { createQueryBuilder: () => qb(raw, calls) };
    for (const m of WRITE_METHODS) repo[m] = () => { throw new Error(`쓰기 호출 금지: ${m}`); };
    return repo;
  };

  it('SELECT(getRawMany)만 사용하고 쓰기 메서드를 호출하지 않으며 결과를 계산한다', async () => {
    const calls: string[] = [];
    const styleRepo = guardedRepo([{ s_styleNo: 'S1', o_styleName: '가상이름' }, { s_styleNo: 'S2', o_styleName: null }], calls);
    const bomRepo = guardedRepo([{ b_id: 1, b_isActive: 1, st_styleNo: 'S1' }], calls);
    const itemRepo = guardedRepo([{ i_category: '안감', i_composition: 'P 100%', bm_id: 1 }], calls);
    const dataSource: any = { getRepository: () => styleRepo, query: () => { throw new Error('쓰기 호출 금지: dataSource.query'); }, transaction: () => { throw new Error('transaction 금지'); } };
    const service = new BomsService(bomRepo, itemRepo, {} as any, {} as any, dataSource);

    const res = await service.findOuterFabricAudit({ status: 'all' } as any);

    expect(calls.filter((c) => c === 'getRawMany')).toHaveLength(3);
    expect(res.items.map((i) => [i.styleNo, i.status])).toEqual([['S1', 'noRow'], ['S2', 'noBom']]);
    expect(res.counts).toEqual({ noBom: 1, noRow: 1, blank: 0, total: 2 });
  });
});
