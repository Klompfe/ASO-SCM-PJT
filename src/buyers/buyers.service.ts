import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Buyer } from './entities/buyer.entity';
import { CreateBuyerDto } from './dto/create-buyer.dto';
import { UpdateBuyerDto } from './dto/update-buyer.dto';
import { GetBuyersFilterDto } from './dto/get-buyers-filter.dto';

// PR-085: 회사 고정 접두사(상수) — "TY-{브랜드약칭}-{YY}{일련번호4자리}" 형식의
// 자동채번(예: TY-MB-260001)에 쓴다.
const COMPANY_PREFIX = 'TY';
// 고객사명에 알파벳이 전혀 없는 경우(순수 한글 회사명 등)의 고정 fallback.
const FALLBACK_BRAND_CODE = 'GN';
// b~d(브랜드코드 결정→연도→다음 일련번호 계산) 사이에 다른 요청이 끼어들어 같은
// code를 계산해버리는 TOCTOU race(6.7절, PR-072와 동일한 종류의 문제)를 대비한
// 재시도 횟수.
const MAX_CODE_GENERATION_RETRIES = 3;

@Injectable()
export class BuyersService {
  private readonly logger = new Logger(BuyersService.name);

  constructor(
    @InjectRepository(Buyer)
    private readonly buyerRepository: Repository<Buyer>,
  ) {}

  // 브랜드/고객약칭 결정: dto.brandCode가 있으면 trim+uppercase 그대로 사용한다.
  // 없으면 고객사명(name)에서 알파벳만 추출해 앞 2글자를 대문자로 쓴다. 알파벳이
  // 1글자뿐이면 그 글자+'X'로 2자리를 채우고, 알파벳이 아예 없으면(순수 한글
  // 회사명 등) 고정 fallback을 쓰고 로그를 남긴다(응답 자체에 별도 플래그를 얹으면
  // Buyer 엔티티 반환 타입을 흔들게 되어, 이 프로젝트의 다른 자동값 안내와
  // 동일하게 로그로 남기는 쪽을 택했다).
  private determineBrandCode(dto: CreateBuyerDto): string {
    if (dto.brandCode && dto.brandCode.trim()) {
      return dto.brandCode.trim().toUpperCase();
    }

    const letters = (dto.name.match(/[A-Za-z]/g) ?? []).join('').toUpperCase();
    if (letters.length >= 2) {
      return letters.slice(0, 2);
    }
    if (letters.length === 1) {
      return `${letters}X`;
    }

    this.logger.warn(
      `고객사명("${dto.name}")에서 알파벳을 추출할 수 없어 브랜드약칭을 기본값(${FALLBACK_BRAND_CODE})으로 대체했습니다.`,
    );
    return FALLBACK_BRAND_CODE;
  }

  // 해당 (brandCode, 연도) 조합의 다음 일련번호를 계산한다. COUNT 방식은 중간에
  // 삭제된 행이 있으면 번호가 중복될 수 있어 쓰지 않는다 — 반드시 기존 code들의
  // 끝 4자리 중 최댓값+1을 사용한다(없으면 1).
  private async generateNextCode(brandCode: string, yy: string): Promise<string> {
    const prefix = `${COMPANY_PREFIX}-${brandCode}-${yy}`;
    const existing = await this.buyerRepository.find({ where: { code: Like(`${prefix}%`) } });

    let maxSeq = 0;
    for (const buyer of existing) {
      const suffix = buyer.code.slice(prefix.length);
      if (/^\d{4}$/.test(suffix)) {
        maxSeq = Math.max(maxSeq, Number(suffix));
      }
    }

    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  }

  async create(createBuyerDto: CreateBuyerDto): Promise<Buyer> {
    const brandCode = this.determineBrandCode(createBuyerDto);
    const yy = String(new Date().getFullYear() % 100).padStart(2, '0');

    for (let attempt = 1; attempt <= MAX_CODE_GENERATION_RETRIES; attempt++) {
      const code = await this.generateNextCode(brandCode, yy);
      try {
        const buyer = this.buyerRepository.create({ ...createBuyerDto, code, brandCode });
        return await this.buyerRepository.save(buyer);
      } catch (error) {
        const isUniqueViolation =
          (error as any)?.code === '23505' || (error as any)?.code === 'SQLITE_CONSTRAINT';
        if (!isUniqueViolation) throw error;
        // 사전 계산(generateNextCode)과 실제 save() 사이의 시간차 동안 동시 요청이
        // 같은 code를 선점한 경우 — 다음 시도에서 최신 최댓값을 다시 계산해 재시도한다.
        this.logger.warn(
          `고객사 코드(${code}) 채번 충돌(${attempt}번째 시도) — 재계산 후 재시도합니다.`,
        );
      }
    }

    throw new ConflictException('고객사 코드 자동채번에 반복적으로 실패했습니다. 잠시 후 다시 시도해 주세요.');
  }

  // PR-127: keyword가 있으면 고객사명/코드/브랜드약칭 부분일치(LOWER() LIKE LOWER()라 SQLite/PostgreSQL에서 똑같이 동작).
  async findAll(filter?: GetBuyersFilterDto): Promise<Buyer[]> {
    const keyword = filter?.keyword?.trim();
    if (!keyword) {
      return await this.buyerRepository.find({
        order: { id: 'DESC' },
      });
    }
    return await this.buyerRepository
      .createQueryBuilder('b')
      .where('(LOWER(b.name) LIKE LOWER(:kw) OR LOWER(b.code) LIKE LOWER(:kw) OR LOWER(b.brandCode) LIKE LOWER(:kw))', { kw: `%${keyword}%` })
      .orderBy('b.id', 'DESC')
      .getMany();
  }

  async findOne(id: number): Promise<Buyer> {
    const buyer = await this.buyerRepository.findOne({ where: { id } });
    if (!buyer) {
      throw new NotFoundException(`ID가 ${id}인 고객사를 찾을 수 없습니다.`);
    }
    return buyer;
  }

  async update(id: number, updateBuyerDto: UpdateBuyerDto): Promise<Buyer> {
    const buyer = await this.findOne(id);
    Object.assign(buyer, updateBuyerDto);
    return await this.buyerRepository.save(buyer);
  }

  async remove(id: number): Promise<void> {
    const buyer = await this.findOne(id);
    await this.buyerRepository.remove(buyer);
  }
}
