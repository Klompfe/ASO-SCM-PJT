import { computeOverallStatus, OrderProcessStagesService } from './order-process-stages.service';

// PR-089: 발주·입고·출고 현황 보고서의 종합상태 계산 로직(poCreated/입고 N of M/exported
// 조합)을 스펙으로 검증한다. 서비스 전체를 인스턴스화할 필요 없는 순수 함수라 이 조합
// 판정 자체만 단위로 테스트한다.
describe('computeOverallStatus (PR-089)', () => {
  it('발주가 없으면(poCreated=false) 입고/출고 값과 무관하게 미발주다', () => {
    expect(computeOverallStatus(false, 0, 0, false, true)).toBe('미발주');
    expect(computeOverallStatus(false, 3, 3, true, true)).toBe('미발주');
  });

  it('발주는 있지만 일부만 입고되면(ready < total) 입고대기다', () => {
    expect(computeOverallStatus(true, 1, 3, false, true)).toBe('입고대기');
    expect(computeOverallStatus(true, 0, 3, false, true)).toBe('입고대기');
  });

  it('BOM 자재가 있는데 그 중 하나도 발주가 안 걸렸으면(total=0으로 판정 불가한 경우 제외) 입고대기다', () => {
    // poCreated=true인데 total=0인 경우는 실제로는 나오지 않지만(자재가 있어야 poCreated가
    // true가 될 수 있으므로), 방어적으로 total===0이면 입고대기로 처리되는지 확인한다.
    expect(computeOverallStatus(true, 0, 0, false, true)).toBe('입고대기');
  });

  it('전체 입고완료(ready === total)인데 아직 출고 전이면 출고대기다', () => {
    expect(computeOverallStatus(true, 3, 3, false, true)).toBe('출고대기');
  });

  it('전체 입고완료 + 출고(ExportShipmentLine 존재)까지 되면 완료다', () => {
    expect(computeOverallStatus(true, 3, 3, true, true)).toBe('완료');
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

  // itemId → 그 자재의 PO 상태들. PR-196: 각 항목은 상태 문자열(= 기존처럼 styleNo 없는
  // 미연결 발주) 또는 { status, styleNo }(연결 발주 또는 명시적으로 미연결) 둘 다 쓸 수 있다.
  type PoFixture = string | { status: string; styleNo?: string | null };
  const build = (boms: any[], pos: Record<number, PoFixture[]> = {}, styles: any[] = [{ styleNo: 'S1', overview: { buyer: 'B' } }], exportedStyles: string[] = [], packedPurchaseOrderIds: number[] = []) => {
    const bomRepo = { find: jest.fn().mockResolvedValue(boms) };
    const poRepo = {
      find: jest.fn().mockImplementation((opts?: any) => {
        let nextId = 1000; // PR-179: 포장내역 매칭용 PO id (테스트마다 결정적으로 부여)
        const all = Object.entries(pos).flatMap(([itemId, entries]) => entries.map((e) => {
          const status = typeof e === 'string' ? e : e.status;
          const styleNo = typeof e === 'string' ? null : (e.styleNo ?? null);
          return { id: nextId++, itemId: Number(itemId), status, styleNo };
        }));
        return Promise.resolve(opts?.where?.itemId !== undefined ? all.filter((p) => p.itemId === opts.where.itemId) : all);
      }),
    };
    const styleRepo = { find: jest.fn().mockResolvedValue(styles) };
    const lineRepo = { find: jest.fn().mockResolvedValue(exportedStyles.map((styleNo) => ({ styleNo }))) };
    const packingRepo = { find: jest.fn().mockResolvedValue(packedPurchaseOrderIds.map((purchaseOrderId) => ({ id: purchaseOrderId, purchaseOrderId }))) };
    const service = new OrderProcessStagesService({} as any, styleRepo as any, bomRepo as any, poRepo as any, lineRepo as any, packingRepo as any);
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

    it('입고는 끝났는데 포장내역이 없는 발주가 있으면 포장내역대기이고, 그 발주 id를 알려준다', async () => {
      const { service } = build([bom(5, 'S1', [1], true)], pos);
      const row = (await service.getProcurementStatusReport()).find((r) => r.styleNo === 'S1')!;
      expect(row).toMatchObject({ overallStatus: '포장내역대기', packed: false, packingPendingPurchaseOrderId: 1000 });
    });

    it('isActive 정보가 없거나 전부 비활성이어도 이전 규칙(가장 큰 id)과 같은 결과', async () => {
      expect(await build([bom(5, 'S1', [1]), bom(6, 'S1', [2, 3])], pos).service.getMaterialReadiness('S1')).toEqual({ totalMaterials: 2, readyMaterials: 0 });
      expect(await build([bom(5, 'S1', [1], false), bom(6, 'S1', [2, 3], false)], pos).service.getMaterialReadiness('S1')).toEqual({ totalMaterials: 2, readyMaterials: 0 });
    });

    it('BOM이 없거나 항목이 없으면 0/0, BOM 조회는 "이 스타일" 1번 + "전체(스타일 귀속 판단용)" 1번, 자재 개수와 무관하게 고정이다', async () => {
      const none = build([], pos);
      expect(await none.service.getMaterialReadiness('S1')).toEqual({ totalMaterials: 0, readyMaterials: 0 });
      const { service, bomRepo } = build([bom(5, 'S1', [1], true), bom(6, 'S1', [2], false)], pos);
      await service.getMaterialReadiness('S1');
      // PR-196: 스타일 귀속 판단(AUTO/AMBIGUOUS)을 위해 전체 BOM을 한 번 더 조회한다 — 자재
      // 개수가 늘어도 이 2번(스타일별 1 + 전체 1)에서 늘지 않는다(N+1 금지).
      expect(bomRepo.find).toHaveBeenCalledTimes(2);
      expect(bomRepo.find).toHaveBeenCalledWith({ where: { style: { styleNo: 'S1' } }, relations: ['items', 'items.material'] });
      expect(bomRepo.find).toHaveBeenCalledWith({ relations: ['items', 'items.material', 'style'] });
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
      // S1의 입고 PO(item 1, id 1000)에는 포장내역이 있어야 출고/완료로 간다.
      const { service } = build(boms, pos, styles, ['S1'], [1000]);
      const rows = await service.getProcurementStatusReport();
      const by = Object.fromEntries(rows.map((r) => [r.styleNo, r]));

      expect(by.S1).toMatchObject({ buyer: 'B1', poCreated: true, materialReadiness: { ready: 1, total: 1 }, exported: true, packed: true, overallStatus: '완료' });
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

  // PR-196: 발주를 품목(itemId)만으로 묶으면 다른 스타일이 쓴 같은 자재의 발주까지
  // "입고완료"로 섞여 버리는 버그의 회귀 테스트 — po-style-attribution.util로 스타일
  // 귀속을 가린 뒤에만 센다.
  describe('스타일별 귀속 (PR-196 회귀 테스트)', () => {
    const twoStyleBoms = [bom(1, 'A', [1], true), bom(2, 'B', [1], true)]; // 스타일 A·B가 같은 자재 1을 쓴다
    const styles = [{ styleNo: 'A', overview: { buyer: 'BA' } }, { styleNo: 'B', overview: { buyer: 'BB' } }];

    it('자재 X의 발주가 styleNo=A로 연결되면 A는 발주완료/입고대기, B는 미발주다(이번 버그의 회귀 테스트)', async () => {
      const pos = { 1: [{ status: 'PENDING', styleNo: 'A' }] };
      const { service } = build(twoStyleBoms, pos as any, styles);
      expect(await service.getMaterialReadiness('A')).toEqual({ totalMaterials: 1, readyMaterials: 0 });
      expect(await service.getMaterialReadiness('B')).toEqual({ totalMaterials: 1, readyMaterials: 0 });
      const rows = await service.getProcurementStatusReport();
      const by = Object.fromEntries(rows.map((r) => [r.styleNo, r]));
      expect(by.A).toMatchObject({ poCreated: true, overallStatus: '입고대기' });
      expect(by.B).toMatchObject({ poCreated: false, overallStatus: '미발주' }); // B는 발주 자체가 없는 것으로 본다
    });

    it('A의 연결 발주를 RECEIVED로 바꿔도 B의 readyMaterials는 0이다(B 몫으로 새지 않음)', async () => {
      const pos = { 1: [{ status: 'RECEIVED', styleNo: 'A' }] };
      const { service } = build(twoStyleBoms, pos as any, styles);
      expect(await service.getMaterialReadiness('A')).toEqual({ totalMaterials: 1, readyMaterials: 1 });
      expect(await service.getMaterialReadiness('B')).toEqual({ totalMaterials: 1, readyMaterials: 0 });
    });

    it('미연결 발주 + 자재 X를 쓰는 스타일이 A 하나뿐이면 A 몫으로 자동 귀속되고 autoAttributedPoCount=1이다', async () => {
      const onlyA = [bom(1, 'A', [1], true)];
      const pos = { 1: ['RECEIVED'] }; // styleNo 없음(미연결)
      const { service } = build(onlyA, pos, [{ styleNo: 'A', overview: null }]);
      expect(await service.getMaterialReadiness('A')).toEqual({ totalMaterials: 1, readyMaterials: 1 });
      const rows = await service.getProcurementStatusReport();
      expect(rows.find((r) => r.styleNo === 'A')).toMatchObject({ poCreated: true, autoAttributedPoCount: 1, unlinkedPoCount: 0 });
    });

    it('미연결 발주 + 자재 X를 A·B 둘 다 쓰면 둘 다 미발주이고, 둘 다 unlinkedPoCount=1이다(추측 금지)', async () => {
      const pos = { 1: ['RECEIVED'] }; // styleNo 없음, A·B 둘 다 자재 1을 씀(twoStyleBoms)
      const { service } = build(twoStyleBoms, pos, styles);
      expect(await service.getMaterialReadiness('A')).toEqual({ totalMaterials: 1, readyMaterials: 0 });
      expect(await service.getMaterialReadiness('B')).toEqual({ totalMaterials: 1, readyMaterials: 0 });
      const rows = await service.getProcurementStatusReport();
      const by = Object.fromEntries(rows.map((r) => [r.styleNo, r]));
      expect(by.A).toMatchObject({ poCreated: false, unlinkedPoCount: 1, autoAttributedPoCount: 0 });
      expect(by.B).toMatchObject({ poCreated: false, unlinkedPoCount: 1, autoAttributedPoCount: 0 });
    });

    it('취소된 발주만 있으면 미발주, 취소+입고가 섞이면 입고된 발주만 센다', async () => {
      const onlyA = [bom(1, 'A', [1], true)];
      const cancelledOnly = { 1: [{ status: 'CANCELLED', styleNo: 'A' }] };
      expect(await build(onlyA, cancelledOnly as any, [{ styleNo: 'A', overview: null }]).service.getMaterialReadiness('A')).toEqual({ totalMaterials: 1, readyMaterials: 0 });

      const mixed = { 1: [{ status: 'CANCELLED', styleNo: 'A' }, { status: 'RECEIVED', styleNo: 'A' }] };
      expect(await build(onlyA, mixed as any, [{ styleNo: 'A', overview: null }]).service.getMaterialReadiness('A')).toEqual({ totalMaterials: 1, readyMaterials: 1 });
    });

    it('포장내역대기 발주 선택이 다른 스타일 발주로 새지 않는다', async () => {
      // A의 입고 발주(id 1000)는 포장내역 없음 → A는 포장내역대기. B는 자재 발주 자체가 없어 미발주.
      const pos = { 1: [{ status: 'RECEIVED', styleNo: 'A' }] };
      const { service } = build(twoStyleBoms, pos as any, styles);
      const rows = await service.getProcurementStatusReport();
      const by = Object.fromEntries(rows.map((r) => [r.styleNo, r]));
      expect(by.A).toMatchObject({ packingPendingPurchaseOrderId: 1000, overallStatus: '포장내역대기' });
      expect(by.B).toMatchObject({ packingPendingPurchaseOrderId: null, overallStatus: '미발주' });
    });
  });

  // PR-179: 입고는 끝났는데 포장내역이 없으면 포장내역대기, 있으면 출고대기로 넘어간다.
  it('전체 입고완료이지만 포장내역이 없으면 포장내역대기다(출고 여부와 무관)', () => {
    expect(computeOverallStatus(true, 3, 3, false, false)).toBe('포장내역대기');
    expect(computeOverallStatus(true, 3, 3, true, false)).toBe('포장내역대기');
  });

  it('포장내역이 있으면 포장내역대기가 아니라 출고대기/완료 판정을 그대로 따른다', () => {
    expect(computeOverallStatus(true, 3, 3, false, true)).toBe('출고대기');
    expect(computeOverallStatus(true, 3, 3, true, true)).toBe('완료');
  });

  it('입고가 덜 끝났으면 포장 여부와 무관하게 입고대기다(포장내역대기로 가려 버리지 않는다)', () => {
    expect(computeOverallStatus(true, 1, 3, false, true)).toBe('입고대기');
  });
});
