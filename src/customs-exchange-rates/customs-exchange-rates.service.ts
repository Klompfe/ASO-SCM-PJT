import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomsExchangeRate, ExchangeRateType } from './entities/customs-exchange-rate.entity';
import { CreateCustomsExchangeRateDto } from './dto/create-customs-exchange-rate.dto';
import { UpdateCustomsExchangeRateDto } from './dto/update-customs-exchange-rate.dto';
import { GetCustomsExchangeRatesFilterDto } from './dto/get-customs-exchange-rates-filter.dto';

export interface ExchangeRateLookupResult {
  found: boolean;
  rate?: number;
  validFrom?: string;
  validTo?: string;
  rateType?: ExchangeRateType;
  // found:false일 때만 참고용. 서버/화면 어디서도 자동 적용하지 않는다.
  previous?: { rate: number; validFrom: string; validTo: string } | null;
}

export interface ExchangeRateStatus {
  date: string;
  EXPORT: ExchangeRateLookupResult;
  IMPORT: ExchangeRateLookupResult;
}

// PR-184: 관세청 주간환율(수출/수입) 수동 입력 테이블. 유니패스는 robots.txt로 크롤링이
// 막혀 있고(PR-157에서 확인) Open API 연동도 이번 범위에서 제외 — 이 서비스는 "조회·추천"만
// 하고 절대 값을 대신 고르거나 자동 확정하지 않는다.
@Injectable()
export class CustomsExchangeRatesService {
  constructor(
    @InjectRepository(CustomsExchangeRate)
    private readonly repository: Repository<CustomsExchangeRate>,
  ) {}

  async findAll(filter?: GetCustomsExchangeRatesFilterDto) {
    const page = filter?.page || 1;
    const limit = filter?.limit || 50;
    const skip = (page - 1) * limit;

    const qb = this.repository.createQueryBuilder('r');
    if (filter?.rateType) qb.andWhere('r.rateType = :rateType', { rateType: filter.rateType });
    if (filter?.currency) qb.andWhere('r.currency = :currency', { currency: filter.currency });
    qb.orderBy('r.validFrom', 'DESC').skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  private assertValidRange(validFrom: string, validTo: string): void {
    if (validFrom > validTo) {
      throw new BadRequestException('적용 시작일은 종료일보다 늦을 수 없습니다.');
    }
  }

  // 같은 rateType+currency에서 기간이 겹치면 400 — "NOT (기존.validTo < 새.validFrom OR 기존.validFrom > 새.validTo)"가 겹침 조건.
  private async assertNoOverlap(
    rateType: ExchangeRateType,
    currency: string,
    validFrom: string,
    validTo: string,
    excludeId?: number,
  ): Promise<void> {
    const qb = this.repository
      .createQueryBuilder('r')
      .where('r.rateType = :rateType', { rateType })
      .andWhere('r.currency = :currency', { currency })
      .andWhere('r.validTo >= :validFrom', { validFrom })
      .andWhere('r.validFrom <= :validTo', { validTo });
    if (excludeId) qb.andWhere('r.id != :excludeId', { excludeId });
    const conflict = await qb.getOne();
    if (conflict) {
      throw new BadRequestException(
        `${rateType === ExchangeRateType.EXPORT ? '수출' : '수입'} ${currency} 환율 중 ${conflict.validFrom}~${conflict.validTo} 기간과 겹칩니다.`,
      );
    }
  }

  async create(dto: CreateCustomsExchangeRateDto): Promise<CustomsExchangeRate> {
    const currency = dto.currency ?? 'USD';
    this.assertValidRange(dto.validFrom, dto.validTo);
    await this.assertNoOverlap(dto.rateType, currency, dto.validFrom, dto.validTo);
    const rate = this.repository.create({ ...dto, currency, note: dto.note ?? null });
    return this.repository.save(rate);
  }

  private async findOneOrFail(id: number): Promise<CustomsExchangeRate> {
    const rate = await this.repository.findOne({ where: { id } });
    if (!rate) {
      throw new NotFoundException(`ID가 ${id}인 환율을 찾을 수 없습니다.`);
    }
    return rate;
  }

  async update(id: number, dto: UpdateCustomsExchangeRateDto): Promise<CustomsExchangeRate> {
    const rate = await this.findOneOrFail(id);
    const next = {
      rateType: dto.rateType ?? rate.rateType,
      currency: dto.currency ?? rate.currency,
      validFrom: dto.validFrom ?? rate.validFrom,
      validTo: dto.validTo ?? rate.validTo,
    };
    this.assertValidRange(next.validFrom, next.validTo);
    await this.assertNoOverlap(next.rateType, next.currency, next.validFrom, next.validTo, id);
    Object.assign(rate, dto);
    return this.repository.save(rate);
  }

  async remove(id: number): Promise<void> {
    const rate = await this.findOneOrFail(id);
    await this.repository.remove(rate);
  }

  private assertDateFormat(date: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('날짜 형식은 YYYY-MM-DD여야 합니다.');
    }
  }

  async lookup(rateType: ExchangeRateType, currency: string, date: string): Promise<ExchangeRateLookupResult> {
    this.assertDateFormat(date);
    const hit = await this.repository
      .createQueryBuilder('r')
      .where('r.rateType = :rateType', { rateType })
      .andWhere('r.currency = :currency', { currency })
      .andWhere('r.validFrom <= :date', { date })
      .andWhere('r.validTo >= :date', { date })
      .getOne();
    if (hit) {
      return { found: true, rate: Number(hit.rate), validFrom: hit.validFrom, validTo: hit.validTo, rateType };
    }
    const prev = await this.repository
      .createQueryBuilder('r')
      .where('r.rateType = :rateType', { rateType })
      .andWhere('r.currency = :currency', { currency })
      .andWhere('r.validTo < :date', { date })
      .orderBy('r.validTo', 'DESC')
      .getOne();
    return {
      found: false,
      previous: prev ? { rate: Number(prev.rate), validFrom: prev.validFrom, validTo: prev.validTo } : null,
    };
  }

  // Render 서버는 UTC라 new Date()를 그대로 쓰면 날짜가 하루 어긋날 수 있다 — 한국 시간 기준.
  private todayInKst(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  async status(currency: string, date?: string): Promise<ExchangeRateStatus> {
    const effectiveDate = date ?? this.todayInKst();
    const [exportResult, importResult] = await Promise.all([
      this.lookup(ExchangeRateType.EXPORT, currency, effectiveDate),
      this.lookup(ExchangeRateType.IMPORT, currency, effectiveDate),
    ]);
    return { date: effectiveDate, EXPORT: exportResult, IMPORT: importResult };
  }
}
