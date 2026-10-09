import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PriceReferenceService } from './price-reference.service';
import { Item } from '../items/entities/item.entity';
import { Bom } from '../boms/entities/bom.entity';
import { BrandPriceRulesService } from '../brand-price-rules/brand-price-rules.service';
import { MidoPriceTableService } from '../mido-price-table/mido-price-table.service';
import { BrandPrefixRulesService } from '../brand-prefix-rules/brand-prefix-rules.service';
import { CustomsExchangeRatesService } from '../customs-exchange-rates/customs-exchange-rates.service';

// PR-185 C: 단가표(USD) 참고단가 — 브랜드 전용가 우선순위, suggested 조건, 범위값/환산
// 미확정은 제안 안 함, 단위 불일치 경고, krw 참고 환산(환율 등록 여부).
describe('PriceReferenceService', () => {
  let service: PriceReferenceService;
  let itemRepo: { findOne: jest.Mock };
  let bomRepo: { find: jest.Mock };
  let brandPriceRulesService: { findActive: jest.Mock };
  let midoPriceTableService: { findCandidates: jest.Mock };
  let brandPrefixRulesService: { findAll: jest.Mock };
  let customsExchangeRatesService: { lookup: jest.Mock };
  let dataSource: { getRepository: jest.Mock };

  const mute = { id: 1, name: '겉감 원단', unit: 'YD' };

  beforeEach(async () => {
    itemRepo = { findOne: jest.fn().mockResolvedValue(mute) };
    bomRepo = { find: jest.fn().mockResolvedValue([]) };
    dataSource = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Item) return itemRepo;
        if (entity === Bom) return bomRepo;
        throw new Error('unexpected repository');
      }),
    };
    brandPriceRulesService = { findActive: jest.fn().mockResolvedValue([]) };
    midoPriceTableService = { findCandidates: jest.fn().mockResolvedValue([]) };
    brandPrefixRulesService = { findAll: jest.fn().mockResolvedValue([]) };
    customsExchangeRatesService = { lookup: jest.fn().mockResolvedValue({ found: false, previous: null }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriceReferenceService,
        { provide: DataSource, useValue: dataSource },
        { provide: BrandPriceRulesService, useValue: brandPriceRulesService },
        { provide: MidoPriceTableService, useValue: midoPriceTableService },
        { provide: BrandPrefixRulesService, useValue: brandPrefixRulesService },
        { provide: CustomsExchangeRatesService, useValue: customsExchangeRatesService },
      ],
    }).compile();
    service = module.get(PriceReferenceService);
  });

  it('없는 품목이면 404', async () => {
    itemRepo.findOne.mockResolvedValue(null);
    await expect(service.getPriceReference({ itemId: 999 } as any)).rejects.toThrow(NotFoundException);
  });

  it('styleNo가 있으면 뮤트 패턴(26FOT08 등)으로 브랜드를 판정하고, 브랜드 전용가가 미도 단가표보다 앞에 온다', async () => {
    brandPrefixRulesService.findAll.mockResolvedValue([
      { prefix: null, isNumericStart: true, numericPattern: '^\\d{2}[FS]', brandName: '뮤트' },
    ]);
    brandPriceRulesService.findActive.mockResolvedValue([
      { id: 1, brandName: '뮤트', categoryKeyword: '겉감', priceUsd: 1.0, unit: 'YD', note: '뮤트 전용가', isActive: true },
    ]);
    midoPriceTableService.findCandidates.mockResolvedValue([
      { id: 10, itemName: '겉감(폴리)', priceUsdMin: 2.5, priceUsdMax: 2.5, unit: 'YD', note: null },
    ]);

    const result = await service.getPriceReference({ itemId: 1, styleNo: '26FOT08' } as any);
    expect(result.brand).toBe('뮤트');
    expect(result.candidates[0]).toMatchObject({ source: 'BRAND_RULE', priceUsd: 1.0 });
    expect(result.candidates[1]).toMatchObject({ source: 'MIDO_TABLE', priceUsd: 2.5 });
  });

  it('뮤트지만 그 품목구분에 전용가 규칙이 없으면 미도 단가표만 후보로 나온다', async () => {
    brandPrefixRulesService.findAll.mockResolvedValue([
      { prefix: null, isNumericStart: true, numericPattern: '^\\d{2}[FS]', brandName: '뮤트' },
    ]);
    brandPriceRulesService.findActive.mockResolvedValue([
      { id: 1, brandName: '뮤트', categoryKeyword: '행어', priceUsd: 0.001, unit: 'EA', isActive: true }, // 겉감이 아니라 행어 — 안 걸림
    ]);
    midoPriceTableService.findCandidates.mockResolvedValue([
      { id: 10, itemName: '겉감(폴리)', priceUsdMin: 2.5, priceUsdMax: 2.5, unit: 'YD', note: null },
    ]);
    const result = await service.getPriceReference({ itemId: 1, styleNo: '26FOT08' } as any);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].source).toBe('MIDO_TABLE');
  });

  it('브랜드가 없으면(styleNo도 brandName도 없음) 브랜드 전용가 없이 미도 단가표만', async () => {
    midoPriceTableService.findCandidates.mockResolvedValue([
      { id: 10, itemName: '겉감(폴리)', priceUsdMin: 2.5, priceUsdMax: 2.5, unit: 'YD', note: null },
    ]);
    const result = await service.getPriceReference({ itemId: 1 } as any);
    expect(result.brand).toBeNull();
    expect(result.candidates).toHaveLength(1);
  });

  it('후보가 정확히 1개이고 범위값이 아니면 suggested를 채운다', async () => {
    midoPriceTableService.findCandidates.mockResolvedValue([
      { id: 10, itemName: '겉감(폴리)', priceUsdMin: 2.5, priceUsdMax: 2.5, unit: 'YD', note: null },
    ]);
    const result = await service.getPriceReference({ itemId: 1 } as any);
    expect(result.suggested).toMatchObject({ priceUsd: 2.5 });
  });

  it('후보가 여러 개면 suggested는 null(사람이 고름)', async () => {
    midoPriceTableService.findCandidates.mockResolvedValue([
      { id: 10, itemName: 'A', priceUsdMin: 2.5, priceUsdMax: 2.5, unit: 'YD' },
      { id: 11, itemName: 'B', priceUsdMin: 3, priceUsdMax: 3, unit: 'YD' },
    ]);
    const result = await service.getPriceReference({ itemId: 1 } as any);
    expect(result.suggested).toBeNull();
  });

  it('범위값(Min≠Max)이면 후보가 1개여도 suggested는 null', async () => {
    midoPriceTableService.findCandidates.mockResolvedValue([
      { id: 10, itemName: 'A', priceUsdMin: 2, priceUsdMax: 3, unit: 'YD' },
    ]);
    const result = await service.getPriceReference({ itemId: 1 } as any);
    expect(result.suggested).toBeNull();
    expect(result.candidates[0].priceUsdMax).toBe(3);
  });

  it('환산 미확정(conversion.determined=false)이면 후보가 1개여도 suggested는 null', async () => {
    midoPriceTableService.findCandidates.mockResolvedValue([
      {
        id: 10, itemName: '실(THREAD)', priceUsdMin: 0.0001, priceUsdMax: 0.0001, unit: 'M',
        conversion: { determined: false, options: [], warning: '실/테이프 종류 미지정 — 선택해 주세요' },
      },
    ]);
    const result = await service.getPriceReference({ itemId: 1, lineUnit: 'CONE' } as any);
    expect(result.suggested).toBeNull();
  });

  it('자재 단위와 단가 단위가 다르면(환산 대상 아닐 때) unitMismatchWarning을 준다', async () => {
    midoPriceTableService.findCandidates.mockResolvedValue([
      { id: 10, itemName: 'A', priceUsdMin: 1, priceUsdMax: 1, unit: 'EA' },
    ]);
    const result = await service.getPriceReference({ itemId: 1, lineUnit: 'YD' } as any);
    expect(result.unitMismatchWarning).toContain('YD');
    expect(result.unitMismatchWarning).toContain('EA');
  });

  it('환산 대상(conversion 있음)이면 단위가 달라 보여도(M vs CONE) 경고하지 않는다', async () => {
    midoPriceTableService.findCandidates.mockResolvedValue([
      {
        id: 10, itemName: '실(THREAD)', priceUsdMin: 0.0001, priceUsdMax: 0.0001, unit: 'M',
        conversion: { determined: true, options: [{ materialSubType: 'COA_SA', displayName: '코아사', packagingUnitLabel: '콘', unitLengthM: 2500, unitPriceUsd: 0.25, formula: 'x' }] },
      },
    ]);
    const result = await service.getPriceReference({ itemId: 1, lineUnit: 'CONE', materialSubType: 'COA_SA' } as any);
    expect(result.unitMismatchWarning).toBeUndefined();
  });

  it('suggested가 있고 환율이 등록돼 있으면 krw 참고 환산을 채운다', async () => {
    midoPriceTableService.findCandidates.mockResolvedValue([
      { id: 10, itemName: 'A', priceUsdMin: 1, priceUsdMax: 1, unit: 'YD' },
    ]);
    customsExchangeRatesService.lookup.mockResolvedValue({ found: true, rate: 1343, validFrom: '2026-10-05', validTo: '2026-10-11' });
    const result = await service.getPriceReference({ itemId: 1, lineUnit: 'YD' } as any);
    expect(result.krw).toEqual({ rate: 1343, validFrom: '2026-10-05', validTo: '2026-10-11', rateType: 'EXPORT', approxUnitPriceKrw: 1343 });
  });

  it('suggested가 있어도 환율이 미등록이면 krw를 생략한다', async () => {
    midoPriceTableService.findCandidates.mockResolvedValue([
      { id: 10, itemName: 'A', priceUsdMin: 1, priceUsdMax: 1, unit: 'YD' },
    ]);
    const result = await service.getPriceReference({ itemId: 1, lineUnit: 'YD' } as any);
    expect(result.krw).toBeUndefined();
  });

  it('suggested가 없으면 환율이 등록돼 있어도 krw를 조회하지 않는다', async () => {
    midoPriceTableService.findCandidates.mockResolvedValue([
      { id: 10, itemName: 'A', priceUsdMin: 1, priceUsdMax: 1, unit: 'YD' },
      { id: 11, itemName: 'B', priceUsdMin: 2, priceUsdMax: 2, unit: 'YD' },
    ]);
    const result = await service.getPriceReference({ itemId: 1 } as any);
    expect(result.suggested).toBeNull();
    expect(result.krw).toBeUndefined();
    expect(customsExchangeRatesService.lookup).not.toHaveBeenCalled();
  });
});
