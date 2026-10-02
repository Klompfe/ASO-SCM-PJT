import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MidoPriceItem } from './entities/mido-price-item.entity';

// PR-157: PurchaseOrder.unitPrice(원화)가 없는 자재의 USD 단가 fallback. 아이템명
// 매칭이 완전히 일치하지 않을 수 있어(자재명세 표기 vs 단가표 표기) 자동으로 하나를
// 확정하지 않고, 느슨한 부분일치로 후보를 전부 반환한다 — 담당자가 화면에서 직접 골라
// 연결한다(PR-156의 "후보 전부 보여주고 자동 확정 금지" 원칙과 동일).
@Injectable()
export class MidoPriceTableService {
  constructor(
    @InjectRepository(MidoPriceItem)
    private readonly repository: Repository<MidoPriceItem>,
  ) {}

  async findAll(): Promise<MidoPriceItem[]> {
    return this.repository.find({ order: { itemName: 'ASC' } });
  }

  // materialName의 각 "단어"(공백/괄호로 대충 쪼갠 토큰)가 단가표 itemName에 포함되어
  // 있으면 후보로 본다 — 완전 일치를 요구하면 "겉감(폴리에스터 57"/58" 혼방)" 같은
  // 표기 차이 때문에 후보가 하나도 안 나올 위험이 크다.
  async findCandidates(materialName: string): Promise<MidoPriceItem[]> {
    const all = await this.findAll();
    const tokens = materialName
      .replace(/[()"/,]/g, ' ')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);

    if (tokens.length === 0) return [];

    return all.filter((item) => tokens.some((t) => item.itemName.includes(t)));
  }
}
