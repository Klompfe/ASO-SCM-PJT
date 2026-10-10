import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PriceReferenceService } from './price-reference.service';
import { Item } from '../items/entities/item.entity';
import { Bom } from '../boms/entities/bom.entity';
import { MaterialPackagingUnitRule } from '../material-packaging-unit-rules/entities/material-packaging-unit-rule.entity';
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
  let ruleRepo: { find: jest.Mock };
  let brandPriceRulesService: { findActive: jest.Mock };
  let midoPriceTableService: { findCandidates: jest.Mock };
  let brandPrefixRulesService: { findAll: jest.Mock };
  let customsExchangeRatesService: { lookup: jest.Mock };
  let dataSource: { getRepository: jest.Mock };

  const mute = { id: 1, name: '겉감 원단', unit: 'YD', materialSubType: null, packagingReviewedAt: null };

  beforeEach(async () => {
    itemRepo = { findOne: jest.fn().mockResolvedValue(mute) };
    bomRepo = { find: jest.fn().mockResolvedValue([]) };
    ruleRepo = { find: jest.fn().mockResolvedValue([]) };
    dataSource = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Item) return itemRepo;
        if (entity === Bom) return bomRepo;
        if (entity === MaterialPackagingUnitRule) return ruleRepo;
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

  // PR-187: Item.unit='EA'인 실/테이프 자재도 종류(Item.materialSubType 또는 BOM 행)가
  // 정해져 있으면 콘/롤 단가로 환산된 후보를 받는다 — PR-185/186 반영 후 운영에서 발견된
  // "미터단가 그대로 채워짐" 문제의 직접적인 수정.
  describe('미터→콘/롤 단가 환산 (PR-187)', () => {
    const obaSaRule = { materialSubType: 'OBA_SA_SKU_I_SA', displayName: '오바사·스쿠이사', packagingUnitLabel: '콘', unitLengthM: 4000 };
    const dadeRule = { materialSubType: 'DADE', displayName: '다데', packagingUnitLabel: '롤', unitLengthM: 50 };
    const amholRule = { materialSubType: 'AMHOL', displayName: '암홀', packagingUnitLabel: '롤', unitLengthM: 50 };

    it('Item.unit=EA + Item.materialSubType 지정 → 콘당 단가로 환산된 후보가 suggested되고 unitMismatchWarning이 없다', async () => {
      itemRepo.findOne.mockResolvedValue({ id: 1, name: '오바사 60S/3H THREAD', unit: 'EA', materialSubType: 'OBA_SA_SKU_I_SA', packagingReviewedAt: null });
      ruleRepo.find.mockResolvedValue([obaSaRule]);
      midoPriceTableService.findCandidates.mockResolvedValue([
        {
          id: 4, itemName: '실(THREAD)', priceUsdMin: 0.00012, priceUsdMax: 0.00012, unit: 'M',
          conversion: {
            determined: true,
            options: [{ materialSubType: 'OBA_SA_SKU_I_SA', displayName: '오바사·스쿠이사', packagingUnitLabel: '콘', unitLengthM: 4000, unitPriceUsd: 0.48, formula: '0.00012/m × 4000m = 0.48/콘' }],
          },
        },
      ]);
      customsExchangeRatesService.lookup.mockResolvedValue({ found: true, rate: 1375.14, validFrom: '2026-10-09', validTo: '2026-10-15' });

      const result = await service.getPriceReference({ itemId: 1 } as any);

      expect(midoPriceTableService.findCandidates).toHaveBeenCalledWith('오바사 60S/3H THREAD', { lineUnit: '콘', materialSubType: 'OBA_SA_SKU_I_SA' });
      expect(result.candidates[0]).toMatchObject({
        priceUsd: 0.48, unit: '콘', conversionFormula: '0.00012/m × 4000m = 0.48/콘',
        convertedFrom: { priceUsd: 0.00012, unit: 'M', unitLengthM: 4000 },
      });
      expect(result.candidates[0].priceUsdMax).toBeUndefined();
      expect(result.suggested).toMatchObject({ priceUsd: 0.48, unit: '콘' });
      expect(result.unitMismatchWarning).toBeUndefined();
      expect(result.warning).toBeUndefined();
      expect(result.packagingUnitLabel).toBe('콘');
      // krw는 미터단가(0.00012)가 아니라 환산된 콘당 단가(0.48) 기준으로 계산돼야 한다.
      expect(result.krw).toMatchObject({ approxUnitPriceKrw: Math.round(0.48 * 1375.14) });
    });

    it('종류 미지정 + 이름이 실/테이프로 보이는(검토 안 됨) 자재는 suggested가 null이고 전용 warning을 낸다', async () => {
      itemRepo.findOne.mockResolvedValue({ id: 2, name: '오바사 60S/3H THREAD', unit: 'EA', materialSubType: null, packagingReviewedAt: null });
      ruleRepo.find.mockResolvedValue([obaSaRule]);
      midoPriceTableService.findCandidates.mockResolvedValue([
        { id: 4, itemName: '실(THREAD)', priceUsdMin: 0.00012, priceUsdMax: 0.00012, unit: 'M' },
      ]);

      const result = await service.getPriceReference({ itemId: 2 } as any);

      expect(midoPriceTableService.findCandidates).toHaveBeenCalledWith('오바사 60S/3H THREAD', { lineUnit: 'EA', materialSubType: undefined });
      expect(result.suggested).toBeNull();
      expect(result.warning).toBe('실/테이프 종류 미지정 — 선택해 주세요');
      expect(result.unitMismatchWarning).toBeUndefined();
    });

    it('검토완료(packagingReviewedAt 있음) + 종류 미지정이면 실/테이프 경고를 내지 않는다(일반 자재 취급)', async () => {
      itemRepo.findOne.mockResolvedValue({ id: 2, name: '오바사 60S/3H THREAD', unit: 'EA', materialSubType: null, packagingReviewedAt: new Date('2026-01-01') });
      ruleRepo.find.mockResolvedValue([obaSaRule]);
      midoPriceTableService.findCandidates.mockResolvedValue([
        { id: 4, itemName: '실(THREAD)', priceUsdMin: 0.00012, priceUsdMax: 0.00012, unit: 'M' },
      ]);

      const result = await service.getPriceReference({ itemId: 2 } as any);

      expect(result.warning).toBeUndefined();
    });

    it('테이프(다데)도 종류 지정 시 롤당 단가로 환산된다', async () => {
      itemRepo.findOne.mockResolvedValue({ id: 3, name: '다데 테이프', unit: 'EA', materialSubType: 'DADE', packagingReviewedAt: null });
      ruleRepo.find.mockResolvedValue([dadeRule, amholRule]);
      midoPriceTableService.findCandidates.mockResolvedValue([
        {
          id: 5, itemName: '다데(TAPE)', priceUsdMin: 0.0008, priceUsdMax: 0.0008, unit: 'M',
          conversion: { determined: true, options: [{ materialSubType: 'DADE', displayName: '다데', packagingUnitLabel: '롤', unitLengthM: 50, unitPriceUsd: 0.04, formula: '0.0008/m × 50m = 0.04/롤' }] },
        },
      ]);

      const result = await service.getPriceReference({ itemId: 3 } as any);

      expect(midoPriceTableService.findCandidates).toHaveBeenCalledWith('다데 테이프', { lineUnit: '롤', materialSubType: 'DADE' });
      expect(result.candidates[0]).toMatchObject({ priceUsd: 0.04, unit: '롤' });
      expect(result.packagingUnitLabel).toBe('롤');
    });

    it('환산 후에도 범위값(min≠max)이면 suggested는 null', async () => {
      itemRepo.findOne.mockResolvedValue({ id: 1, name: '오바사 60S/3H THREAD', unit: 'EA', materialSubType: 'OBA_SA_SKU_I_SA', packagingReviewedAt: null });
      ruleRepo.find.mockResolvedValue([obaSaRule]);
      midoPriceTableService.findCandidates.mockResolvedValue([
        {
          id: 4, itemName: '실(THREAD)', priceUsdMin: 0.0001, priceUsdMax: 0.00012, unit: 'M',
          conversion: {
            determined: true,
            options: [{ materialSubType: 'OBA_SA_SKU_I_SA', displayName: '오바사·스쿠이사', packagingUnitLabel: '콘', unitLengthM: 4000, unitPriceUsd: 0.4, unitPriceUsdMax: 0.48, formula: 'x', formulaMax: 'y' }],
          },
        },
      ]);

      const result = await service.getPriceReference({ itemId: 1 } as any);

      expect(result.candidates[0]).toMatchObject({ priceUsd: 0.4, priceUsdMax: 0.48 });
      expect(result.suggested).toBeNull();
    });

    it('일반 자재(라벨 등, 실/테이프로 안 보이고 종류도 없음)는 기존과 동일하게 동작한다', async () => {
      itemRepo.findOne.mockResolvedValue({ id: 6, name: '메인 라벨', unit: 'EA', materialSubType: null, packagingReviewedAt: null });
      ruleRepo.find.mockResolvedValue([obaSaRule]);
      midoPriceTableService.findCandidates.mockResolvedValue([
        { id: 7, itemName: '라벨', priceUsdMin: 0.05, priceUsdMax: 0.05, unit: 'EA' },
      ]);

      const result = await service.getPriceReference({ itemId: 6 } as any);

      expect(midoPriceTableService.findCandidates).toHaveBeenCalledWith('메인 라벨', { lineUnit: 'EA', materialSubType: undefined });
      expect(result.suggested).toMatchObject({ priceUsd: 0.05 });
      expect(result.warning).toBeUndefined();
      expect(result.unitMismatchWarning).toBeUndefined();
      expect(result.packagingUnitLabel).toBeUndefined();
    });

    it('BOM 행의 종류(단일값)가 Item.materialSubType보다 우선한다', async () => {
      itemRepo.findOne.mockResolvedValue({ id: 1, name: '오바사/다데 겸용', unit: 'EA', materialSubType: 'OBA_SA_SKU_I_SA', packagingReviewedAt: null });
      bomRepo.find.mockResolvedValue([{ id: 1, isActive: true, items: [{ category: '실', material: { id: 1 }, threadType: null, tapeType: 'DADE' }] }]);
      ruleRepo.find.mockResolvedValue([dadeRule]);
      midoPriceTableService.findCandidates.mockResolvedValue([
        { id: 5, itemName: '다데(TAPE)', priceUsdMin: 0.0008, priceUsdMax: 0.0008, unit: 'M' },
      ]);

      await service.getPriceReference({ itemId: 1, styleNo: 'MB1' } as any);

      expect(midoPriceTableService.findCandidates).toHaveBeenCalledWith('오바사/다데 겸용', { lineUnit: '롤', materialSubType: 'DADE' });
    });

    it('BOM 행에 서로 다른 종류가 섞여 모호하면 BOM은 무시하고 Item.materialSubType을 쓴다', async () => {
      itemRepo.findOne.mockResolvedValue({ id: 1, name: '혼합', unit: 'EA', materialSubType: 'OBA_SA_SKU_I_SA', packagingReviewedAt: null });
      bomRepo.find.mockResolvedValue([{
        id: 1, isActive: true,
        items: [
          { category: '실', material: { id: 1 }, threadType: 'COA_SA', tapeType: null },
          { category: '실', material: { id: 1 }, threadType: 'DADE', tapeType: null },
        ],
      }]);
      ruleRepo.find.mockResolvedValue([obaSaRule]);
      midoPriceTableService.findCandidates.mockResolvedValue([
        { id: 4, itemName: '실(THREAD)', priceUsdMin: 0.00012, priceUsdMax: 0.00012, unit: 'M' },
      ]);

      await service.getPriceReference({ itemId: 1, styleNo: 'MB1' } as any);

      expect(midoPriceTableService.findCandidates).toHaveBeenCalledWith('혼합', { lineUnit: '콘', materialSubType: 'OBA_SA_SKU_I_SA' });
    });

    it('dto.materialSubType이 BOM/Item보다 최우선이다', async () => {
      itemRepo.findOne.mockResolvedValue({ id: 1, name: '오바사', unit: 'EA', materialSubType: 'OBA_SA_SKU_I_SA', packagingReviewedAt: null });
      bomRepo.find.mockResolvedValue([{ id: 1, isActive: true, items: [{ category: '실', material: { id: 1 }, threadType: 'COA_SA', tapeType: null }] }]);
      ruleRepo.find.mockResolvedValue([dadeRule]);
      midoPriceTableService.findCandidates.mockResolvedValue([
        { id: 5, itemName: '다데(TAPE)', priceUsdMin: 0.0008, priceUsdMax: 0.0008, unit: 'M' },
      ]);

      await service.getPriceReference({ itemId: 1, styleNo: 'MB1', materialSubType: 'DADE' } as any);

      expect(midoPriceTableService.findCandidates).toHaveBeenCalledWith('오바사', { lineUnit: '롤', materialSubType: 'DADE' });
    });

    it('요청에 이미 콘/롤로 명시된 lineUnit이 있으면 규칙 라벨로 덮어쓰지 않고 그대로 쓴다(기존 동작 유지)', async () => {
      itemRepo.findOne.mockResolvedValue({ id: 1, name: '오바사', unit: 'EA', materialSubType: null, packagingReviewedAt: null });
      ruleRepo.find.mockResolvedValue([obaSaRule]);
      midoPriceTableService.findCandidates.mockResolvedValue([]);

      await service.getPriceReference({ itemId: 1, lineUnit: 'CONE', materialSubType: 'OBA_SA_SKU_I_SA' } as any);

      expect(midoPriceTableService.findCandidates).toHaveBeenCalledWith('오바사', { lineUnit: 'CONE', materialSubType: 'OBA_SA_SKU_I_SA' });
    });

    it('종류는 있으나 규칙 테이블에 없으면(데이터 누락) 추측하지 않고 Item.unit을 그대로 쓴다', async () => {
      itemRepo.findOne.mockResolvedValue({ id: 1, name: '지누이도', unit: 'EA', materialSubType: 'POLY_JINUIDO', packagingReviewedAt: null });
      ruleRepo.find.mockResolvedValue([]); // POLY_JINUIDO 규칙 없음
      midoPriceTableService.findCandidates.mockResolvedValue([]);

      await service.getPriceReference({ itemId: 1 } as any);

      expect(midoPriceTableService.findCandidates).toHaveBeenCalledWith('지누이도', { lineUnit: 'EA', materialSubType: 'POLY_JINUIDO' });
    });
  });
});
