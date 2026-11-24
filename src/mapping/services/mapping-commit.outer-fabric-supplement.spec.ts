import { MappingCommitService } from './mapping-commit.service';

// PR-258: 사전 판정은 읽기 전용(트랜잭션을 열지도, 쓰기 메서드를 부르지도 않는다), 부적격 실행도 쓰기 0 — mock 으로 확인한다.
describe('MappingCommitService 겉감 보충 — 쓰기 금지 (PR-258)', () => {
  const WRITE = ['save', 'insert', 'update', 'delete', 'remove', 'softDelete', 'upsert', 'query', 'increment', 'decrement'];

  function build(opts: { style: unknown; boms: unknown[] }) {
    const calls: string[] = [];
    const manager: any = {
      findOne: async () => { calls.push('findOne'); return opts.style; },
      find: async () => { calls.push('find'); return opts.boms; },
    };
    for (const m of WRITE) manager[m] = () => { throw new Error(`쓰기 호출 금지: ${m}`); };
    const runner: any = {
      manager,
      isTransactionActive: false,
      connect: async () => undefined,
      release: async () => undefined,
      startTransaction: async () => { calls.push('startTransaction'); runner.isTransactionActive = true; },
      commitTransaction: async () => { calls.push('commit'); runner.isTransactionActive = false; },
      rollbackTransaction: async () => { calls.push('rollback'); runner.isTransactionActive = false; },
    };
    const dataSource: any = { createQueryRunner: () => runner, options: { type: 'sqlite' } };
    return { service: new MappingCommitService(dataSource), calls };
  }

  const style = { styleNo: 'S1', overview: { totalQty: 100 } };
  const boms = [{ id: 1, isActive: true, items: [{ id: 10, category: '안감', colorCode: 'N/A', spec: 'N/A', consumption: 1, material: { id: 5, name: 'LIN-A' } }] }];
  const payload = { styleNo: 'S1', bomItems: [{ category: '겉감', itemName: '겉감 OUT-SHELL', consumption: 1 }, { category: '안감', itemName: 'LIN-A', consumption: 1 }] } as never;

  it('사전 판정: SELECT 만 사용하고 트랜잭션을 열지 않으며 적격이어도 쓰지 않는다', async () => {
    const { service, calls } = build({ style, boms });
    const res = await service.checkOuterFabricSupplement(payload);
    expect(res).toMatchObject({ eligible: true, applied: false });
    expect(calls).not.toContain('startTransaction');
    expect(calls).not.toContain('commit');
  });

  it('보충 실행이라도 부적격이면(이미 겉감 있음) 쓰지 않고 롤백만 한다', async () => {
    const withOuter = [{ ...boms[0], items: [...boms[0].items, { id: 11, category: '겉감', colorCode: 'N/A', spec: 'N/A', consumption: 1, material: { id: 6, name: '겉감X' } }] }];
    const { service, calls } = build({ style, boms: withOuter });
    const res = await service.supplementOuterFabric(payload);
    expect(res).toMatchObject({ eligible: false, applied: false, reason: 'ALREADY_HAS_OUTER_FABRIC' });
    expect(calls).toContain('rollback');
    expect(calls).not.toContain('commit');
  });

  it('미등록 스타일·BOM 없는 스타일도 쓰지 않는다', async () => {
    expect((await build({ style: null, boms: [] }).service.supplementOuterFabric(payload)).reason).toBe('NOT_REGISTERED');
    expect((await build({ style, boms: [] }).service.supplementOuterFabric(payload)).reason).toBe('NO_BOM');
  });
});
