import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BuyersService } from './buyers.service';
import { Buyer } from './entities/buyer.entity';

describe('BuyersService', () => {
  let service: BuyersService;
  let repo: Repository<Buyer>;

  const currentYy = String(new Date().getFullYear() % 100).padStart(2, '0');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BuyersService,
        {
          provide: getRepositoryToken(Buyer),
          useValue: {
            find: jest.fn(),
            create: jest.fn((v) => v),
            save: jest.fn((v) => Promise.resolve({ id: 1, ...v })),
            findOne: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(BuyersService);
    repo = module.get(getRepositoryToken(Buyer));
  });

  describe('create — 브랜드약칭 결정', () => {
    it('brandCode를 지정하면 trim+uppercase해서 그대로 쓴다', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);

      const result = await service.create({ name: 'Myungbo Trading', brandCode: ' mb ' } as any);

      expect(result.code).toBe(`TY-MB-${currentYy}0001`);
      expect((result as any).brandCode).toBe('MB');
    });

    it('brandCode 미지정 시 고객사명에서 알파벳 앞 2글자를 대문자로 추출한다', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);

      const result = await service.create({ name: 'myungbo trading co.' } as any);

      expect(result.code).toBe(`TY-MY-${currentYy}0001`);
    });

    it('알파벳이 1글자뿐이면 그 글자+X로 채운다', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);

      const result = await service.create({ name: '미도 A상사' } as any);

      expect(result.code).toBe(`TY-AX-${currentYy}0001`);
    });

    it('알파벳이 전혀 없으면(순수 한글 회사명) 기본값(GN)을 쓴다', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);

      const result = await service.create({ name: '미도컴퍼니' } as any);

      expect(result.code).toBe(`TY-GN-${currentYy}0001`);
    });
  });

  describe('create — 일련번호 채번', () => {
    it('같은 브랜드로 연속 등록하면 일련번호가 증가한다', async () => {
      (repo.find as jest.Mock).mockResolvedValueOnce([]);
      const first = await service.create({ name: 'Myungbo', brandCode: 'MB' } as any);
      expect(first.code).toBe(`TY-MB-${currentYy}0001`);

      (repo.find as jest.Mock).mockResolvedValueOnce([{ code: `TY-MB-${currentYy}0001` }]);
      const second = await service.create({ name: 'Myungbo', brandCode: 'MB' } as any);
      expect(second.code).toBe(`TY-MB-${currentYy}0002`);
    });

    it('다른 브랜드는 독립적으로 0001부터 시작한다', async () => {
      (repo.find as jest.Mock).mockResolvedValueOnce([{ code: `TY-MB-${currentYy}0001` }, { code: `TY-MB-${currentYy}0002` }]);
      const buyerMb = await service.create({ name: 'Myungbo', brandCode: 'MB' } as any);
      expect(buyerMb.code).toBe(`TY-MB-${currentYy}0003`);

      (repo.find as jest.Mock).mockResolvedValueOnce([]);
      const buyerXx = await service.create({ name: 'Xylophone', brandCode: 'XX' } as any);
      expect(buyerXx.code).toBe(`TY-XX-${currentYy}0001`);
    });

    it('중간에 삭제된 행이 있어도(COUNT 아닌 최댓값 방식) 기존 최댓값+1로 채번한다', async () => {
      // 0001, 0003만 남아있는 상황(0002는 삭제됨) — COUNT 방식이면 0003을 만들지만
      // 최댓값 방식은 0004가 되어야 한다.
      (repo.find as jest.Mock).mockResolvedValueOnce([
        { code: `TY-MB-${currentYy}0001` },
        { code: `TY-MB-${currentYy}0003` },
      ]);

      const result = await service.create({ name: 'Myungbo', brandCode: 'MB' } as any);

      expect(result.code).toBe(`TY-MB-${currentYy}0004`);
    });
  });

  describe('create — 고객사명만으로 등록', () => {
    it('name만 있어도 성공한다(나머지 필드 없이)', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);

      const result = await service.create({ name: 'Only Name Co' } as any);

      expect(result.code).toBeDefined();
      expect(result).toEqual(expect.objectContaining({ name: 'Only Name Co' }));
    });
  });

  describe('create — 동시성(TOCTOU) 재시도', () => {
    it('unique 제약 위반이면 재계산 후 재시도해 결국 성공한다', async () => {
      (repo.find as jest.Mock)
        .mockResolvedValueOnce([]) // 1차 계산: 0001
        .mockResolvedValueOnce([{ code: `TY-MB-${currentYy}0001` }]); // 재시도 계산: 0002

      let callCount = 0;
      (repo.save as jest.Mock).mockImplementation((v: any) => {
        callCount++;
        if (callCount === 1) {
          const err: any = new Error('duplicate key');
          err.code = '23505';
          return Promise.reject(err);
        }
        return Promise.resolve({ id: 1, ...v });
      });

      const result = await service.create({ name: 'Myungbo', brandCode: 'MB' } as any);

      expect(result.code).toBe(`TY-MB-${currentYy}0002`);
      expect(repo.save).toHaveBeenCalledTimes(2);
    });

    it('재시도를 모두 소진하면 ConflictException을 던진다', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);
      const err: any = new Error('duplicate key');
      err.code = '23505';
      (repo.save as jest.Mock).mockRejectedValue(err);

      await expect(service.create({ name: 'Myungbo', brandCode: 'MB' } as any)).rejects.toThrow(
        ConflictException,
      );
    });

    it('unique 위반이 아닌 다른 에러는 그대로 던진다', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);
      const err = new Error('some other db error');
      (repo.save as jest.Mock).mockRejectedValue(err);

      await expect(service.create({ name: 'Myungbo', brandCode: 'MB' } as any)).rejects.toThrow(
        'some other db error',
      );
    });
  });
});
