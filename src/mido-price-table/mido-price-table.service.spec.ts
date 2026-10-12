import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
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
        { provide: DataSource, useValue: {} }, // findCandidates만 쓰므로 실제 DataSource 기능은 필요 없음(DI 해결용 스텁).
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
        { provide: DataSource, useValue: {} },
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

// PR-188: 관리 API — 등록/수정/사용중지, CSV 일괄 등록 미리보기/적용. 별도 describe로
// 분리한다(위 블록들과 providers 구성이 달라 DataSource 모킹이 추가로 필요).
describe('MidoPriceTableService — 관리 API (PR-188)', () => {
  let service: MidoPriceTableService;
  let repo: Repository<MidoPriceItem>;
  let dataSource: { createQueryRunner: jest.Mock };
  let queryRunnerManager: { save: jest.Mock; create: jest.Mock };
  let queryRunner: {
    connect: jest.Mock; startTransaction: jest.Mock; commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock; release: jest.Mock; manager: typeof queryRunnerManager;
  };

  const seed = [
    { id: 1, itemName: '겉감(WOOL 60~70%)', priceUsdMin: 2.5, priceUsdMax: 3, unit: 'EA' },
    { id: 2, itemName: '겉감(폴리에스터 57"/58" 혼방)', priceUsdMin: 0.03, priceUsdMax: 0.07, unit: 'EA' },
  ];

  beforeEach(async () => {
    queryRunnerManager = {
      save: jest.fn((entity: any) => Promise.resolve(entity)),
      create: jest.fn((_entity: any, data: any) => ({ id: 99, ...data })),
    };
    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: queryRunnerManager,
    };
    dataSource = { createQueryRunner: jest.fn().mockReturnValue(queryRunner) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MidoPriceTableService,
        {
          provide: getRepositoryToken(MidoPriceItem),
          useValue: {
            find: jest.fn().mockResolvedValue(seed),
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn((data: any) => ({ id: 100, isActive: true, ...data })),
            save: jest.fn((entity: any) => Promise.resolve(entity)),
          },
        },
        { provide: MaterialPackagingUnitRulesService, useValue: { findAll: jest.fn().mockResolvedValue([]) } },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(MidoPriceTableService);
    repo = module.get(getRepositoryToken(MidoPriceItem));
  });

  describe('findAll — isActive 필터', () => {
    it('기본 호출은 isActive:true 조건으로 조회한다', async () => {
      await service.findAll();
      expect((repo.find as jest.Mock)).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
    });

    it('includeInactive=true면 조건 없이 전체를 조회한다', async () => {
      await service.findAll(true);
      const call = (repo.find as jest.Mock).mock.calls.at(-1)[0];
      expect(call.where).toBeUndefined();
    });
  });

  // PR-188: 단가표 항목 등록/수정 — 추측 저장 금지(중복 itemName 거절, min<=max 검증).
  describe('create / update (PR-188)', () => {
    it('신규 항목을 등록한다', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      const result = await service.create({ itemName: '새 항목', priceUsdMin: 1, priceUsdMax: 2, unit: 'YD' });
      expect(result).toMatchObject({ itemName: '새 항목', priceUsdMin: 1, priceUsdMax: 2, unit: 'YD', isActive: true });
    });

    it('중복 itemName이면 거절한다', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({ id: 1, itemName: '겉감(WOOL 60~70%)' });
      await expect(service.create({ itemName: '겉감(WOOL 60~70%)', priceUsdMin: 1, priceUsdMax: 2, unit: 'YD' })).rejects.toThrow(BadRequestException);
    });

    it('priceUsdMin이 priceUsdMax보다 크면 거절한다', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.create({ itemName: '새 항목', priceUsdMin: 5, priceUsdMax: 3, unit: 'YD' })).rejects.toThrow(BadRequestException);
    });

    it('itemName이 비어 있으면(공백만) 거절한다', async () => {
      await expect(service.create({ itemName: '   ', priceUsdMin: 1, priceUsdMax: 1, unit: 'YD' })).rejects.toThrow(BadRequestException);
    });

    it('isActive를 false로 바꾸면 사용 중지되고, 삭제 메서드는 존재하지 않는다(실수 방지)', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({ id: 2, itemName: '겉감(폴리에스터 57"/58" 혼방)', priceUsdMin: 0.03, priceUsdMax: 0.07, unit: 'EA', isActive: true });
      const result = await service.update(2, { isActive: false });
      expect(result.isActive).toBe(false);
      expect((service as any).remove).toBeUndefined();
    });

    it('없는 id를 수정하려 하면 404', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.update(999, { isActive: false })).rejects.toThrow('ID가 999인 단가표 항목을 찾을 수 없습니다.');
    });
  });

  // PR-188: 일괄 등록 미리보기 — DB에 쓰지 않고 NEW/CHANGED/SAME/ERROR로만 분류한다.
  describe('importPreview (PR-188)', () => {
    const HEADER = 'itemName,priceUsdMin,priceUsdMax,unit,note';

    it('기존에 없는 itemName은 NEW로 분류한다', async () => {
      (repo.find as jest.Mock).mockResolvedValue(seed);
      const res = await service.importPreview(`${HEADER}\n신규항목,1,1,YD,`);
      expect(res.rows[0]).toMatchObject({ status: 'NEW' });
      expect(res.summary).toMatchObject({ new: 1, changed: 0, same: 0, error: 0, total: 1 });
    });

    it('기존과 완전히 같은 값이면 SAME으로 분류한다', async () => {
      (repo.find as jest.Mock).mockResolvedValue(seed);
      const res = await service.importPreview(`${HEADER}\n겉감(WOOL 60~70%),2.5,3,EA,`);
      expect(res.rows[0]).toMatchObject({ status: 'SAME' });
    });

    it('기존과 값이 다르면 CHANGED로 분류하고 before/after를 함께 준다', async () => {
      (repo.find as jest.Mock).mockResolvedValue(seed);
      const res = await service.importPreview(`${HEADER}\n겉감(WOOL 60~70%),2.8,3.2,EA,변경됨`);
      expect(res.rows[0].status).toBe('CHANGED');
      expect(res.rows[0].before).toMatchObject({ priceUsdMin: 2.5, priceUsdMax: 3 });
      expect(res.rows[0].after).toMatchObject({ priceUsdMin: 2.8, priceUsdMax: 3.2 });
    });

    it('형식 오류 행은 ERROR로 분류하고 errors를 담는다(DB에 쓰지 않음)', async () => {
      (repo.find as jest.Mock).mockResolvedValue(seed);
      const res = await service.importPreview(`${HEADER}\n잘못된행,abc,1,YD,`);
      expect(res.rows[0].status).toBe('ERROR');
      expect(res.rows[0].errors?.length).toBeGreaterThan(0);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('헤더가 없으면 400(BadRequestException)', async () => {
      await expect(service.importPreview('a,b,c\n1,2,3')).rejects.toThrow(BadRequestException);
    });

    it('501행을 넘으면 400', async () => {
      const rows = Array.from({ length: 501 }, (_, i) => `항목${i},1,1,YD,`).join('\n');
      await expect(service.importPreview(`${HEADER}\n${rows}`)).rejects.toThrow(BadRequestException);
    });
  });

  // PR-188: 일괄 등록 적용 — all-or-nothing 트랜잭션, 파일에 없는 기존 행은 불변, 삭제 없음.
  describe('importApply (PR-188)', () => {
    it('신규/변경 행을 upsert하고 생성·수정 건수를 돌려준다', async () => {
      (repo.find as jest.Mock).mockResolvedValue(seed); // id=1 겉감(WOOL 60~70%) 기존 존재
      const result = await service.importApply([
        { line: 1, itemName: '신규항목', priceUsdMin: 1, priceUsdMax: 1, unit: 'YD', status: 'NEW' },
        { line: 2, itemName: '겉감(WOOL 60~70%)', priceUsdMin: 2.8, priceUsdMax: 3.2, unit: 'EA', status: 'CHANGED' },
      ] as any);
      expect(result).toEqual({ created: 1, updated: 1 });
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('한 행이라도 형식 오류면(min>max) 전부 거절하고 아무것도 저장하지 않는다(all-or-nothing)', async () => {
      (repo.find as jest.Mock).mockResolvedValue(seed);
      await expect(
        service.importApply([
          { line: 1, itemName: '신규항목', priceUsdMin: 1, priceUsdMax: 1, unit: 'YD', status: 'NEW' },
          { line: 2, itemName: '잘못된행', priceUsdMin: 5, priceUsdMax: 1, unit: 'YD', status: 'NEW' },
        ] as any),
      ).rejects.toThrow(BadRequestException);
      expect(queryRunnerManager.save).not.toHaveBeenCalled();
    });

    it('선택한 행에 itemName이 중복되면 거절한다', async () => {
      (repo.find as jest.Mock).mockResolvedValue(seed);
      await expect(
        service.importApply([
          { line: 1, itemName: '같은이름', priceUsdMin: 1, priceUsdMax: 1, unit: 'YD', status: 'NEW' },
          { line: 2, itemName: '같은이름', priceUsdMin: 2, priceUsdMax: 2, unit: 'YD', status: 'NEW' },
        ] as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('빈 배열이면 400', async () => {
      await expect(service.importApply([])).rejects.toThrow(BadRequestException);
    });

    it('파일에 없는 기존 행(seed의 다른 항목)은 손대지 않는다(선택한 행만 save)', async () => {
      (repo.find as jest.Mock).mockResolvedValue(seed);
      await service.importApply([
        { line: 1, itemName: '겉감(WOOL 60~70%)', priceUsdMin: 2.8, priceUsdMax: 3.2, unit: 'EA', status: 'CHANGED' },
      ] as any);
      expect(queryRunnerManager.save).toHaveBeenCalledTimes(1);
      expect(queryRunnerManager.save).toHaveBeenCalledWith(expect.objectContaining({ itemName: '겉감(WOOL 60~70%)' }));
    });

    it('예외 발생 시 롤백한다', async () => {
      (repo.find as jest.Mock).mockResolvedValue(seed);
      queryRunnerManager.save.mockRejectedValueOnce(new Error('DB 오류'));
      await expect(
        service.importApply([{ line: 1, itemName: '신규항목', priceUsdMin: 1, priceUsdMax: 1, unit: 'YD', status: 'NEW' }] as any),
      ).rejects.toThrow('DB 오류');
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    });
  });
});
