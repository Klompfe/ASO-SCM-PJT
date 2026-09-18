import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { CashVoucher, CashVoucherType } from './entities/cash-voucher.entity';
import { CreateCashVoucherDto } from './dto/create-cash-voucher.dto';
import { UpdateCashVoucherDto } from './dto/update-cash-voucher.dto';
import { FindCashVouchersDto } from './dto/find-cash-vouchers.dto';

export interface CashVoucherSummary {
  depositTotal: number;
  withdrawalTotal: number;
  balance: number;
}

// from/to 둘 다, 하나만, 아예 없을 때를 전부 지원해야 하므로 TypeORM 연산자를 조합한다.
// 'YYYY-MM-DD' 문자열을 그대로 넘긴다 — new Date(...)로 바꿔서 넘기면 sqlite 드라이버가
// 타임존 변환 중 날짜가 하루 밀려 저장된 'date' 문자열과 어긋나는 것을 실측으로 확인했다
// (postgres는 문제없지만 두 드라이버에서 동일하게 동작해야 e2e/운영 결과가 일치한다).
// voucherDate 컬럼 타입이 Date라 TS가 string을 거부하므로 any로 우회한다.
function buildDateWhere(from?: string, to?: string) {
  if (from && to) return Between(from as any, to as any);
  if (from) return MoreThanOrEqual(from as any);
  if (to) return LessThanOrEqual(to as any);
  return undefined;
}

@Injectable()
export class CashVouchersService {
  constructor(
    @InjectRepository(CashVoucher)
    private readonly cashVoucherRepository: Repository<CashVoucher>,
  ) {}

  async create(dto: CreateCashVoucherDto, createdBy: number): Promise<CashVoucher> {
    const voucher = this.cashVoucherRepository.create({
      voucherType: dto.voucherType,
      voucherDate: new Date(dto.voucherDate),
      amount: dto.amount,
      counterpartyName: dto.counterpartyName,
      counterpartyBuyerId: dto.counterpartyBuyerId ?? null,
      counterpartySupplierId: dto.counterpartySupplierId ?? null,
      account: dto.account,
      category: dto.category,
      relatedPurchaseOrderId: dto.relatedPurchaseOrderId ?? null,
      relatedProductionContractId: dto.relatedProductionContractId ?? null,
      note: dto.note ?? null,
      createdBy,
    });
    return this.cashVoucherRepository.save(voucher);
  }

  async findAll(filter: FindCashVouchersDto): Promise<CashVoucher[]> {
    const dateWhere = buildDateWhere(filter.from, filter.to);
    return this.cashVoucherRepository.find({
      where: {
        ...(dateWhere ? { voucherDate: dateWhere } : {}),
        ...(filter.voucherType ? { voucherType: filter.voucherType } : {}),
        ...(filter.buyerId ? { counterpartyBuyerId: filter.buyerId } : {}),
        ...(filter.supplierId ? { counterpartySupplierId: filter.supplierId } : {}),
      },
      order: { voucherDate: 'DESC', id: 'DESC' },
    });
  }

  async findOne(id: number): Promise<CashVoucher> {
    const voucher = await this.cashVoucherRepository.findOne({ where: { id } });
    if (!voucher) {
      throw new NotFoundException(`ID가 ${id}인 입출금전표를 찾을 수 없습니다.`);
    }
    return voucher;
  }

  async update(id: number, dto: UpdateCashVoucherDto): Promise<CashVoucher> {
    const voucher = await this.findOne(id);
    const { voucherDate, ...rest } = dto;
    Object.assign(voucher, rest);
    if (voucherDate !== undefined) {
      voucher.voucherDate = new Date(voucherDate);
    }
    return this.cashVoucherRepository.save(voucher);
  }

  async remove(id: number): Promise<void> {
    const voucher = await this.findOne(id);
    await this.cashVoucherRepository.remove(voucher);
  }

  // PR-094: 기간 합계(입금합계/출금합계/잔액=입금-출금). voucherType 필터는 요약
  // 성격상 받지 않는다(둘 다 합쳐서 봐야 잔액이 의미가 있으므로) — from/to만 받는다.
  // PR-108: 거래내역서 발급을 위해 buyerId/supplierId로도 필터할 수 있게 확장했다
  // (기존엔 회사 전체 합계만 가능했음) — 둘 다 없으면 기존과 동일하게 전체 합계.
  async getSummary(from?: string, to?: string, buyerId?: number, supplierId?: number): Promise<CashVoucherSummary> {
    const dateWhere = buildDateWhere(from, to);
    const vouchers = await this.cashVoucherRepository.find({
      where: {
        ...(dateWhere ? { voucherDate: dateWhere } : {}),
        ...(buyerId ? { counterpartyBuyerId: buyerId } : {}),
        ...(supplierId ? { counterpartySupplierId: supplierId } : {}),
      },
    });

    let depositTotal = 0;
    let withdrawalTotal = 0;
    for (const voucher of vouchers) {
      const amount = Number(voucher.amount);
      if (voucher.voucherType === CashVoucherType.DEPOSIT) {
        depositTotal += amount;
      } else {
        withdrawalTotal += amount;
      }
    }

    return { depositTotal, withdrawalTotal, balance: depositTotal - withdrawalTotal };
  }
}
