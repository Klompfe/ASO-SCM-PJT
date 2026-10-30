import { DataSource } from 'typeorm';
import { MappingCommitService } from './mapping-commit.service';
import { Bom } from '../../boms/entities/bom.entity';
import { StyleColorSizeQuantity, QuantityMarket, QuantitySource } from '../../styles/entities/style-color-size-quantity.entity';
import { CommitMappingDto } from '../dto/commit-mapping.dto';

// PR-212: 색상×사이즈 수량 병합(재업로드) 규칙과 totalQty 후보/불일치 알림 — 별도 파일로
// 두는 이유는 기존 mapping-commit.service.spec.ts(대형 파일)를 건드리지 않고, 이 PR이
// 추가한 동작만 독립적으로 검증하기 위함이다. 모킹 패턴은 기존 파일과 동일하되, find()가
// Bom과 StyleColorSizeQuantity 둘 다에 쓰이므로 엔티티별로 분기해 응답한다.
describe('MappingCommitService — 색상×사이즈 수량 병합/totalQty 후보 (PR-212)', () => {
  let service: MappingCommitService;
  let existingBoms: any[];
  let existingQuantities: any[];
  let savedQuantities: any[];

  const mockQueryRunnerManager = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn((_entity: any, data: any) => data),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: mockQueryRunnerManager,
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    manager: { find: jest.fn(), findOne: jest.fn() },
  };

  const basePayload = (overrides: Partial<CommitMappingDto> = {}): CommitMappingDto => ({
    styleNo: 'MB00TEST',
    overviewData: { styleNo: 'MB00TEST', totalQty: 700, factory: '베트남', buyer: '미도컴퍼니', shipDate: '' },
    bomItems: [],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    existingBoms = [];
    existingQuantities = [];
    savedQuantities = [];

    mockQueryRunnerManager.find.mockImplementation((entity: any) => {
      if (entity === Bom) return Promise.resolve(existingBoms);
      if (entity === StyleColorSizeQuantity) return Promise.resolve(existingQuantities);
      return Promise.resolve([]);
    });
    mockQueryRunnerManager.findOne.mockResolvedValue(null); // 기본: 신규 스타일
    mockQueryRunnerManager.save.mockImplementation((entity: any, data: any) => {
      if (entity === StyleColorSizeQuantity) savedQuantities.push(data);
      return Promise.resolve(data);
    });

    service = new MappingCommitService(mockDataSource as unknown as DataSource);
  });

  it('새 (color,size)는 INSERT된다(source=MATERIAL_LIST)', async () => {
    const payload = basePayload({
      colorSizeQuantities: [{ color: 'BK', size: '55', qty: 100 }],
    });
    await service.commit(payload);
    expect(savedQuantities).toEqual([
      expect.objectContaining({ styleNo: 'MB00TEST', color: 'BK', size: '55', qty: 100, source: QuantitySource.MATERIAL_LIST }),
    ]);
  });

  it('동일값 재업로드는 변경 0(저장 호출 없음)', async () => {
    existingQuantities = [{ id: 1, styleNo: 'MB00TEST', color: 'BK', size: '55', qty: 100, market: QuantityMarket.DOMESTIC, source: QuantitySource.MATERIAL_LIST }];
    const payload = basePayload({ colorSizeQuantities: [{ color: 'BK', size: '55', qty: 100 }] });
    const result = await service.commit(payload);
    expect(savedQuantities).toEqual([]);
    expect(result.notices.some((n) => n.code === 'QTY_UPDATED')).toBe(false);
  });

  it('값이 바뀌면 UPDATE하고 QTY_UPDATED 알림(이전값→새값 포함)', async () => {
    existingQuantities = [{ id: 1, styleNo: 'MB00TEST', color: 'BK', size: '55', qty: 100, market: QuantityMarket.DOMESTIC, source: QuantitySource.MATERIAL_LIST }];
    const payload = basePayload({ colorSizeQuantities: [{ color: 'BK', size: '55', qty: 150 }] });
    const result = await service.commit(payload);
    expect(savedQuantities).toEqual([expect.objectContaining({ color: 'BK', size: '55', qty: 150 })]);
    const notice = result.notices.find((n) => n.code === 'QTY_UPDATED');
    expect(notice).toBeDefined();
    expect(notice!.message).toContain('100→150');
  });

  it('기존 행이 source=MANUAL이면 건드리지 않고 QTY_KEPT_MANUAL 알림', async () => {
    existingQuantities = [{ id: 1, styleNo: 'MB00TEST', color: 'BK', size: '55', qty: 999, market: QuantityMarket.DOMESTIC, source: QuantitySource.MANUAL }];
    const payload = basePayload({ colorSizeQuantities: [{ color: 'BK', size: '55', qty: 150 }] });
    const result = await service.commit(payload);
    expect(savedQuantities).toEqual([]);
    expect(result.notices.some((n) => n.code === 'QTY_KEPT_MANUAL')).toBe(true);
  });

  it('기존에는 있고 새 시트에는 없는 칸은 삭제하지 않고 QTY_NOT_IN_SHEET 알림(건수만)', async () => {
    existingQuantities = [
      { id: 1, styleNo: 'MB00TEST', color: 'BK', size: '55', qty: 100, market: QuantityMarket.DOMESTIC, source: QuantitySource.MATERIAL_LIST },
      { id: 2, styleNo: 'MB00TEST', color: 'BE', size: '55', qty: 200, market: QuantityMarket.DOMESTIC, source: QuantitySource.MATERIAL_LIST },
    ];
    const payload = basePayload({ colorSizeQuantities: [{ color: 'BK', size: '55', qty: 100 }] });
    const result = await service.commit(payload);
    expect(mockQueryRunnerManager.delete).not.toHaveBeenCalledWith(StyleColorSizeQuantity, expect.anything());
    const notice = result.notices.find((n) => n.code === 'QTY_NOT_IN_SHEET');
    expect(notice).toBeDefined();
    expect(notice!.message).toContain('1건');
  });

  it('colorSizeQuantities가 undefined면(구버전 프런트) 전혀 손대지 않는다', async () => {
    existingQuantities = [{ id: 1, styleNo: 'MB00TEST', color: 'BK', size: '55', qty: 100, market: QuantityMarket.DOMESTIC, source: QuantitySource.MATERIAL_LIST }];
    const payload = basePayload(); // colorSizeQuantities 없음
    const result = await service.commit(payload);
    expect(savedQuantities).toEqual([]);
    expect(result.notices.filter((n) => n.code.startsWith('QTY_'))).toEqual([]);
  });

  it('신규 스타일: totalQty가 0이고 색상×사이즈 합계가 양수면 합계를 totalQty로 채운다', async () => {
    const payload = basePayload({
      overviewData: { styleNo: 'MB00TEST', totalQty: 0, totalQtyCandidate: 700, factory: '베트남', buyer: '미도컴퍼니', shipDate: '' },
      colorSizeQuantities: [{ color: 'BK', size: '55', qty: 700 }],
    });
    await service.commit(payload);
    const styleSaveCall = mockQueryRunnerManager.save.mock.calls.find((c) => c[0]?.overview);
    expect(styleSaveCall![0].overview.totalQty).toBe(700);
  });

  it('기존 스타일: 기존 totalQty가 양수면 색상×사이즈 합계와 달라도 절대 덮어쓰지 않고 TOTAL_QTY_MISMATCH만 알린다', async () => {
    mockQueryRunnerManager.findOne.mockResolvedValue({
      styleNo: 'MB00TEST',
      overview: { id: 1, totalQty: 700, factory: '베트남' },
    });
    const payload = basePayload({
      // 실측 118/118 시트처럼 headerRow[8]은 못 읽어 0(section-parser.util.ts) — 이 경로가
      // 바로 PR-211/PR-212가 보호하는 실제 시나리오다.
      overviewData: { styleNo: 'MB00TEST', totalQty: 0, factory: '베트남', buyer: '미도컴퍼니', shipDate: '' },
      colorSizeQuantities: [{ color: 'BK', size: '55', qty: 650 }],
    });
    const result = await service.commit(payload);
    const styleSaveCall = mockQueryRunnerManager.save.mock.calls.find((c) => c[0]?.overview);
    expect(styleSaveCall![0].overview.totalQty).toBe(700); // 덮어쓰지 않음
    const notice = result.notices.find((n) => n.code === 'TOTAL_QTY_MISMATCH');
    expect(notice).toBeDefined();
    expect(notice!.message).toContain('700');
    expect(notice!.message).toContain('650');
  });

  it('기존 스타일: 기존 totalQty가 0/없음이면 색상×사이즈 합계 후보로 채운다', async () => {
    mockQueryRunnerManager.findOne.mockResolvedValue({
      styleNo: 'MB00TEST',
      overview: { id: 1, totalQty: 0, factory: '베트남' },
    });
    const payload = basePayload({
      overviewData: { styleNo: 'MB00TEST', totalQty: 0, totalQtyCandidate: 650, factory: '베트남', buyer: '미도컴퍼니', shipDate: '' },
      colorSizeQuantities: [{ color: 'BK', size: '55', qty: 650 }],
    });
    const result = await service.commit(payload);
    const styleSaveCall = mockQueryRunnerManager.save.mock.calls.find((c) => c[0]?.overview);
    expect(styleSaveCall![0].overview.totalQty).toBe(650);
    expect(result.notices.some((n) => n.code === 'TOTAL_QTY_MISMATCH')).toBe(false);
  });

  it('트랜잭션 롤백 시 저장된 수량 행도 커밋되지 않는다(rollbackTransaction 호출, save는 실제 DB 반영 전)', async () => {
    mockQueryRunnerManager.save.mockImplementation((entity: any) => {
      if (entity === StyleColorSizeQuantity) throw new Error('DB 오류(시뮬레이션)');
      return Promise.resolve({});
    });
    const payload = basePayload({ colorSizeQuantities: [{ color: 'BK', size: '55', qty: 100 }] });
    await expect(service.commit(payload)).rejects.toThrow();
    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
  });
});
