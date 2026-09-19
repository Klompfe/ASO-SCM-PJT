import { computeOverallStatus, OrderProcessStagesService } from './order-process-stages.service';

// PR-089: 발주·입고·출고 현황 보고서의 종합상태 계산 로직(poCreated/입고 N of M/exported
// 조합)을 스펙으로 검증한다. 서비스 전체를 인스턴스화할 필요 없는 순수 함수라 이 조합
// 판정 자체만 단위로 테스트한다.
describe('computeOverallStatus (PR-089)', () => {
  it('발주가 없으면(poCreated=false) 입고/출고 값과 무관하게 미발주다', () => {
    expect(computeOverallStatus(false, 0, 0, false)).toBe('미발주');
    expect(computeOverallStatus(false, 3, 3, true)).toBe('미발주');
  });

  it('발주는 있지만 일부만 입고되면(ready < total) 입고대기다', () => {
    expect(computeOverallStatus(true, 1, 3, false)).toBe('입고대기');
    expect(computeOverallStatus(true, 0, 3, false)).toBe('입고대기');
  });

  it('BOM 자재가 있는데 그 중 하나도 발주가 안 걸렸으면(total=0으로 판정 불가한 경우 제외) 입고대기다', () => {
    // poCreated=true인데 total=0인 경우는 실제로는 나오지 않지만(자재가 있어야 poCreated가
    // true가 될 수 있으므로), 방어적으로 total===0이면 입고대기로 처리되는지 확인한다.
    expect(computeOverallStatus(true, 0, 0, false)).toBe('입고대기');
  });

  it('전체 입고완료(ready === total)인데 아직 출고 전이면 출고대기다', () => {
    expect(computeOverallStatus(true, 3, 3, false)).toBe('출고대기');
  });

  it('전체 입고완료 + 출고(ExportShipmentLine 존재)까지 되면 완료다', () => {
    expect(computeOverallStatus(true, 3, 3, true)).toBe('완료');
  });
});

// PR-123: 자재 준비 상태(getMaterialReadiness)와 발주·입고·출고 현황(getProcurementStatusReport)이 "최고 id"가 아니라
// pickActiveBom 규칙(활성 BOM 중 최신)으로 스타일의 BOM을 고른다. 두 곳 모두 이전 규칙과 같은 결과가 나오는
// 경우(isActive 없음 / 전부 비활성 / 최신이 활성)도 함께 고정한다.
describe('OrderProcessStagesService — BOM 선택 규칙 (PR-123)', () => {
  const RECEIVED = 'RECEIVED';
  const bom = (id: number, styleNo: string, materialIds: number[], isActive?: boolean) => ({
    id,
    ...(isActive === undefined ? {} : { isActive }),
    style: { styleNo },
    items: materialIds.map((m) => ({ material: { id: m } })),
  });

  // itemId → 그 자재의 PO 상태들
  const build = (boms: any[], pos: Record<number, string[]> = {}, styles: any[] = [{ styleNo: 'S1', overview: { buyer: 'B' } }], exportedStyles: string[] = []) => {
    const bomRepo = { find: jest.fn().mockResolvedValue(boms) };
    const poRepo = {
      find: jest.fn().mockImplementation((opts?: any) => {
        const all = Object.entries(pos).flatMap(([itemId, statuses]) => statuses.map((status) => ({ itemId: Number(itemId), status })));
        return Promise.resolve(opts?.where?.itemId !== undefined ? all.filter((p) => p.itemId === opts.where.itemId) : all);
      }),
    };
    const styleRepo = { find: jest.fn().mockResolvedValue(styles) };
    const lineRepo = { find: jest.fn().mockResolvedValue(exportedStyles.map((styleNo) => ({ styleNo }))) };
    const service = new OrderProcessStagesService({} as any, styleRepo as any, bomRepo as any, poRepo as any, lineRepo as any);
    return { service, bomRepo, poRepo };
  };

  describe('getMaterialReadiness', () => {
    // 활성(더 오래된) BOM은 자재 1종(전부 입고), 비활성(더 최신) BOM은 자재 2종(입고 안 됨)
    const pos = { 1: [RECEIVED], 2: ['PENDING'], 3: [] as string[] };

    it('id가 더 큰 BOM이 비활성이면 활성 BOM 기준으로 계산한다', async () => {
      const { service } = build([bom(5, 'S1', [1], true), bom(6, 'S1', [2, 3], false)], pos);
      expect(await service.getMaterialReadiness('S1')).toEqual({ totalMaterials: 1, readyMaterials: 1 });
    });

    it('활성이 최신(id 최대)이면 기존과 같은 결과', async () => {
      const { service } = build([bom(5, 'S1', [1], false), bom(6, 'S1', [2, 3], true)], pos);
      expect(await service.getMaterialReadiness('S1')).toEqual({ totalMaterials: 2, readyMaterials: 0 });
    });

    it('isActive 정보가 없거나 전부 비활성이어도 이전 규칙(가장 큰 id)과 같은 결과', async () => {
      expect(await build([bom(5, 'S1', [1]), bom(6, 'S1', [2, 3])], pos).service.getMaterialReadiness('S1')).toEqual({ totalMaterials: 2, readyMaterials: 0 });
      expect(await build([bom(5, 'S1', [1], false), bom(6, 'S1', [2, 3], false)], pos).service.getMaterialReadiness('S1')).toEqual({ totalMaterials: 2, readyMaterials: 0 });
    });

    it('BOM이 없거나 항목이 없으면 0/0, 스타일의 BOM을 한 번의 쿼리로 가져온다', async () => {
      const none = build([], pos);
      expect(await none.service.getMaterialReadiness('S1')).toEqual({ totalMaterials: 0, readyMaterials: 0 });
      const { service, bomRepo } = build([bom(5, 'S1', [1], true), bom(6, 'S1', [2], false)], pos);
      await service.getMaterialReadiness('S1');
      expect(bomRepo.find).toHaveBeenCalledTimes(1);
      expect(bomRepo.find).toHaveBeenCalledWith({ where: { style: { styleNo: 'S1' } }, relations: ['items', 'items.material'] });
      expect(await build([bom(5, 'S1', [], true)], pos).service.getMaterialReadiness('S1')).toEqual({ totalMaterials: 0, readyMaterials: 0 });
    });
  });

  describe('getProcurementStatusReport (배치)', () => {
    const styles = [{ styleNo: 'S1', overview: { buyer: 'B1' } }, { styleNo: 'S2', overview: null }, { styleNo: 'S3', overview: null }];
    const pos = { 1: [RECEIVED], 2: ['PENDING'], 3: [RECEIVED], 9: [RECEIVED] };

    it('스타일마다 활성 BOM으로 계산한다 — S1: 오래된 활성 BOM(자재1), S2: 최신이 활성(자재2·3), S3: BOM 없음', async () => {
      const boms = [
        bom(5, 'S1', [1], true), bom(6, 'S1', [2, 3], false), // S1: 활성이 더 오래된 쪽
        bom(7, 'S2', [1], false), bom(8, 'S2', [2, 3], true), // S2: 활성이 최신(=이전 규칙과 동일)
      ];
      const { service } = build(boms, pos, styles, ['S1']);
      const rows = await service.getProcurementStatusReport();
      const by = Object.fromEntries(rows.map((r) => [r.styleNo, r]));

      expect(by.S1).toMatchObject({ buyer: 'B1', poCreated: true, materialReadiness: { ready: 1, total: 1 }, exported: true, overallStatus: '완료' });
      expect(by.S2).toMatchObject({ poCreated: true, materialReadiness: { ready: 1, total: 2 }, overallStatus: '입고대기' });
      expect(by.S3).toMatchObject({ poCreated: false, materialReadiness: { ready: 0, total: 0 }, overallStatus: '미발주' });
    });

    it('isActive 정보가 없거나 전부 비활성이어도 이전 규칙(가장 큰 id)과 같은 결과', async () => {
      const legacy = [bom(5, 'S1', [1]), bom(6, 'S1', [2, 3])];
      expect((await build(legacy, pos, styles).service.getProcurementStatusReport()).find((r) => r.styleNo === 'S1')!.materialReadiness).toEqual({ ready: 1, total: 2 });
      const allOff = [bom(5, 'S1', [1], false), bom(6, 'S1', [2, 3], false)];
      expect((await build(allOff, pos, styles).service.getProcurementStatusReport()).find((r) => r.styleNo === 'S1')!.materialReadiness).toEqual({ ready: 1, total: 2 });
    });

    it('N+1이 없다: BOM/PO/수출라인/스타일을 각각 한 번씩만 조회한다(스타일·BOM 수와 무관)', async () => {
      const boms = Array.from({ length: 30 }, (_, i) => bom(100 + i, `X${i % 10}`, [1, 2], i % 3 === 0));
      const manyStyles = Array.from({ length: 10 }, (_, i) => ({ styleNo: `X${i}`, overview: null }));
      const { service, bomRepo, poRepo } = build(boms, pos, manyStyles);
      await service.getProcurementStatusReport();
      expect(bomRepo.find).toHaveBeenCalledTimes(1);
      expect(poRepo.find).toHaveBeenCalledTimes(1);
    });

    it('스타일이 없는 BOM(style=null)은 무시한다', async () => {
      const orphan = { id: 1, isActive: true, style: null, items: [{ material: { id: 1 } }] };
      const rows = await build([orphan, bom(2, 'S1', [1], true)], pos).service.getProcurementStatusReport();
      expect(rows.find((r) => r.styleNo === 'S1')!.materialReadiness).toEqual({ ready: 1, total: 1 });
    });
  });
});
