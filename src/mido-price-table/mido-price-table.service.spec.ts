import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MidoPriceTableService } from './mido-price-table.service';
import { MidoPriceItem } from './entities/mido-price-item.entity';

describe('MidoPriceTableService (PR-157)', () => {
  let service: MidoPriceTableService;
  let repo: Repository<MidoPriceItem>;

  const seed = [
    { id: 1, itemName: '겉감(WOOL 60~70%)', priceUsdMin: 2.5, priceUsdMax: 3, unit: 'EA' },
    { id: 2, itemName: '겉감(폴리에스터 57"/58" 혼방)', priceUsdMin: 0.03, priceUsdMax: 0.07, unit: 'EA' },
    { id: 3, itemName: '실(THREAD)', priceUsdMin: 0.00012, priceUsdMax: 0.00012, unit: 'M' },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MidoPriceTableService,
        { provide: getRepositoryToken(MidoPriceItem), useValue: { find: jest.fn().mockResolvedValue(seed) } },
      ],
    }).compile();
    service = module.get(MidoPriceTableService);
    repo = module.get(getRepositoryToken(MidoPriceItem));
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
