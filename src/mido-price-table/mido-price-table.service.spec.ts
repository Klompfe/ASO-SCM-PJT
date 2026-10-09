import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MidoPriceTableService } from './mido-price-table.service';
import { MidoPriceItem } from './entities/mido-price-item.entity';
import { MaterialPackagingUnitRulesService } from '../material-packaging-unit-rules/material-packaging-unit-rules.service';

describe('MidoPriceTableService (PR-157)', () => {
  let service: MidoPriceTableService;
  let repo: Repository<MidoPriceItem>;
  let packagingRulesService: { findAll: jest.Mock };

  const seed = [
    { id: 1, itemName: '겉감(WOOL 60~70%)', priceUsdMin: 2.5, priceUsdMax: 3, unit: 'EA' },
    { id: 2, itemName: '겉감(폴리에스터 57"/58" 혼방)', priceUsdMin: 0.03, priceUsdMax: 0.07, unit: 'EA' },
    { id: 3, itemName: '실(THREAD)', priceUsdMin: 0.00012, priceUsdMax: 0.00012, unit: 'M' },
    { id: 4, itemName: '테이프(다데)', priceUsdMin: 0.0008, priceUsdMax: 0.0008, unit: 'M' },
    { id: 5, itemName: '테이프(암홀)', priceUsdMin: 0.01, priceUsdMax: 0.01, unit: 'M' },
  ];

  // PR-175 실제 시드값과 동일한 포장단위 규칙.
  const RULES = [
    { id: 1, materialSubType: 'COA_SA', displayName: '코아사', packagingUnitLabel: '콘', unitLengthM: 2500 },
    { id: 2, materialSubType: 'OBA_SA_SKU_I_SA', displayName: '오바사·스쿠이사', packagingUnitLabel: '콘', unitLengthM: 4000 },
    { id: 3, materialSubType: 'POLY_JINUIDO', displayName: '폴리지누이도', packagingUnitLabel: '콘', unitLengthM: 500 },
    { id: 4, materialSubType: 'DADE', displayName: '다데', packagingUnitLabel: '롤', unitLengthM: 50 },
    { id: 5, materialSubType: 'AMHOL', displayName: '암홀', packagingUnitLabel: '롤', unitLengthM: 50 },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MidoPriceTableService,
        { provide: getRepositoryToken(MidoPriceItem), useValue: { find: jest.fn().mockResolvedValue(seed) } },
        { provide: MaterialPackagingUnitRulesService, useValue: { findAll: jest.fn().mockResolvedValue(RULES) } },
      ],
    }).compile();
    service = module.get(MidoPriceTableService);
    repo = module.get(getRepositoryToken(MidoPriceItem));
    packagingRulesService = module.get(MaterialPackagingUnitRulesService);
  });

  it('자재명 토큰이 단가표 항목명에 부분포함되면 후보로 반환한다(완전 일치 요구 안 함) — "겉감"은 두 항목에 공통이라 둘 다 후보', async () => {
    const result = await service.findCandidates('겉감 WOOL 98%');
    expect(result.map((r) => r.id).sort()).toEqual([1, 2]);
  });

  it('여러 항목이 매칭되면 전부 후보로 반환한다(자동으로 하나를 고르지 않음)', async () => {
    const result = await service.findCandidates('겉감');
    expect(result.map((r) => r.id).sort()).toEqual([1, 2]);
  });

  it('실 관련 자재명은 "실(THREAD)" 항목을 후보로 찾는다', async () => {
    const result = await service.findCandidates('오바사 60S/3H THREAD');
    expect(result.map((r) => r.id)).toContain(3);
  });

  it('일치하는 후보가 없으면 빈 배열', async () => {
    const result = await service.findCandidates('완전히 무관한 자재명');
    expect(result).toEqual([]);
  });

  it('짧은 토큰(1글자)은 매칭에 쓰지 않는다(너무 흔해 오탐 위험)', async () => {
    (repo.find as jest.Mock).mockResolvedValue([{ id: 9, itemName: '단추', priceUsdMin: 0.1, priceUsdMax: 0.1, unit: 'EA' }]);
    const result = await service.findCandidates('단');
    expect(result).toEqual([]);
  });
});

// PR-182: 미터단가 후보 → 콘/롤단가 환산.
describe('MidoPriceTableService.findCandidates — 미터단가 콘/롤 환산 (PR-182)', () => {
  let service: MidoPriceTableService;
  let repo: Repository<MidoPriceItem>;

  const seed = [
    { id: 3, itemName: '실(THREAD)', priceUsdMin: 0.00012, priceUsdMax: 0.00012, unit: 'M' },
    { id: 4, itemName: '테이프(TAPE) 다데', priceUsdMin: 0.0008, priceUsdMax: 0.0008, unit: 'M' },
    { id: 5, itemName: '테이프(TAPE) 암홀', priceUsdMin: 0.01, priceUsdMax: 0.01, unit: 'M' },
    { id: 6, itemName: '심지(INTERLINING) 58"/60"', priceUsdMin: 0.07, priceUsdMax: 0.07, unit: 'M' },
    { id: 1, itemName: '겉감(WOOL 60~70%)', priceUsdMin: 2.5, priceUsdMax: 3, unit: 'EA' },
  ];
  const RULES = [
    { id: 1, materialSubType: 'COA_SA', displayName: '코아사', packagingUnitLabel: '콘', unitLengthM: 2500 },
    { id: 2, materialSubType: 'OBA_SA_SKU_I_SA', displayName: '오바사·스쿠이사', packagingUnitLabel: '콘', unitLengthM: 4000 },
    { id: 3, materialSubType: 'POLY_JINUIDO', displayName: '폴리지누이도', packagingUnitLabel: '콘', unitLengthM: 500 },
    { id: 4, materialSubType: 'DADE', displayName: '다데', packagingUnitLabel: '롤', unitLengthM: 50 },
    { id: 5, materialSubType: 'AMHOL', displayName: '암홀', packagingUnitLabel: '롤', unitLengthM: 50 },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MidoPriceTableService,
        { provide: getRepositoryToken(MidoPriceItem), useValue: { find: jest.fn().mockResolvedValue(seed) } },
        { provide: MaterialPackagingUnitRulesService, useValue: { findAll: jest.fn().mockResolvedValue(RULES) } },
      ],
    }).compile();
    service = module.get(MidoPriceTableService);
    repo = module.get(getRepositoryToken(MidoPriceItem));
  });

  it('lineUnit을 안 보내면(기존 호출) conversion 없이 기존과 동일하게 반환한다', async () => {
    const result = await service.findCandidates('실 THREAD');
    expect(result.find((r) => r.id === 3)?.conversion).toBeUndefined();
  });

  it('라인 단위가 M이면(수량이 이미 미터) 환산하지 않는다', async () => {
    const result = await service.findCandidates('실 THREAD', { lineUnit: 'M', materialSubType: 'COA_SA' });
    expect(result.find((r) => r.id === 3)?.conversion).toBeUndefined();
  });

  it('종류(materialSubType)가 확정돼 있으면 그 종류 하나로만 환산한다(determined)', async () => {
    const result = await service.findCandidates('실 THREAD', { lineUnit: 'CONE', materialSubType: 'COA_SA' });
    const conv = result.find((r) => r.id === 3)!.conversion!;
    expect(conv.determined).toBe(true);
    expect(conv.options).toHaveLength(1);
    expect(conv.options[0]).toMatchObject({ materialSubType: 'COA_SA', displayName: '코아사', unitPriceUsd: 0.3 });
    expect(conv.warning).toBeUndefined();
  });

  it('종류가 미지정이면(CONE) 실 종류별 환산값을 전부 후보로 나열하고 경고를 붙인다', async () => {
    const result = await service.findCandidates('실 THREAD', { lineUnit: 'CONE' });
    const conv = result.find((r) => r.id === 3)!.conversion!;
    expect(conv.determined).toBe(false);
    expect(conv.options.map((o) => o.unitPriceUsd).sort()).toEqual([0.06, 0.3, 0.48]);
    expect(conv.warning).toContain('미지정');
  });

  it('종류가 미지정이고 후보 이름에 구체적인 종류가 드러나면(다데/암홀) 그 후보 자신의 미터단가로만 환산한다 — 서로 다른 미터단가를 섞지 않는다', async () => {
    const result = await service.findCandidates('테이프 TAPE', { lineUnit: 'ROLL' });
    const dade = result.find((r) => r.id === 4)!.conversion!;
    const amhol = result.find((r) => r.id === 5)!.conversion!;
    expect(dade.determined).toBe(false);
    expect(dade.options).toEqual([expect.objectContaining({ materialSubType: 'DADE', unitPriceUsd: 0.04 })]);
    expect(amhol.options).toEqual([expect.objectContaining({ materialSubType: 'AMHOL', unitPriceUsd: 0.5 })]);
    // PR-185: 과거 "TAPE 10MM을 $0.04로 일괄 청구" 안내 문구는 제거했다 — 종류 미지정이어도 후보만 나열한다.
    expect((dade as any).referenceNote).toBeUndefined();
    expect((amhol as any).referenceNote).toBeUndefined();
  });

  it('후보 이름이 특정 종류를 가리키지 않으면(예: "TAPE 10MM" 한 줄로 합쳐진 표기) 카테고리의 모든 종류를 나열한다', async () => {
    (repo.find as jest.Mock).mockResolvedValue([{ id: 7, itemName: 'TAPE 10MM', priceUsdMin: 0.0008, priceUsdMax: 0.0008, unit: 'M' }]);
    const result = await service.findCandidates('TAPE 10MM', { lineUnit: 'ROLL' });
    const conv = result.find((r) => r.id === 7)!.conversion!;
    expect(conv.options.map((o) => o.materialSubType).sort()).toEqual(['AMHOL', 'DADE']);
    expect((conv as any).referenceNote).toBeUndefined();
  });

  it('단가표 단위가 M이 아니면(EA 등) 환산 대상이 아니다', async () => {
    const result = await service.findCandidates('겉감 WOOL', { lineUnit: 'CONE', materialSubType: 'COA_SA' });
    expect(result.find((r) => r.id === 1)?.conversion).toBeUndefined();
  });

  it('종류는 알지만 해당 포장단위 규칙이 없으면(데이터 누락) 추측하지 않고 미지정 처리로 넘어간다', async () => {
    const result = await service.findCandidates('실 THREAD', { lineUnit: 'CONE', materialSubType: 'UNKNOWN_TYPE' });
    const conv = result.find((r) => r.id === 3)!.conversion!;
    expect(conv.determined).toBe(false);
    expect(conv.options.length).toBeGreaterThan(0);
  });
});
