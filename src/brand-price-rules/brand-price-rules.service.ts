import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrandPriceRule } from './entities/brand-price-rule.entity';
import { CreateBrandPriceRuleDto } from './dto/create-brand-price-rule.dto';
import { UpdateBrandPriceRuleDto } from './dto/update-brand-price-rule.dto';

@Injectable()
export class BrandPriceRulesService {
  constructor(
    @InjectRepository(BrandPriceRule)
    private readonly repository: Repository<BrandPriceRule>,
  ) {}

  async findAll(): Promise<BrandPriceRule[]> {
    return this.repository.find({ order: { brandName: 'ASC', categoryKeyword: 'ASC' } });
  }

  // PR-185 price-reference가 쓰는 조회 형태 — 활성 규칙만.
  async findActive(): Promise<BrandPriceRule[]> {
    return this.repository.find({ where: { isActive: true }, order: { brandName: 'ASC', categoryKeyword: 'ASC' } });
  }

  private async assertNoDuplicate(brandName: string, categoryKeyword: string, excludeId?: number): Promise<void> {
    const existing = await this.repository.findOne({ where: { brandName, categoryKeyword } });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException(`"${brandName}"/"${categoryKeyword}" 조합은 이미 등록되어 있습니다.`);
    }
  }

  async create(dto: CreateBrandPriceRuleDto): Promise<BrandPriceRule> {
    await this.assertNoDuplicate(dto.brandName, dto.categoryKeyword);
    const rule = this.repository.create({ ...dto, note: dto.note ?? null, isActive: dto.isActive ?? true });
    return this.repository.save(rule);
  }

  private async findOneOrFail(id: number): Promise<BrandPriceRule> {
    const rule = await this.repository.findOne({ where: { id } });
    if (!rule) {
      throw new NotFoundException(`ID가 ${id}인 브랜드 전용가 규칙을 찾을 수 없습니다.`);
    }
    return rule;
  }

  async update(id: number, dto: UpdateBrandPriceRuleDto): Promise<BrandPriceRule> {
    const rule = await this.findOneOrFail(id);
    const nextBrand = dto.brandName ?? rule.brandName;
    const nextCategory = dto.categoryKeyword ?? rule.categoryKeyword;
    if (nextBrand !== rule.brandName || nextCategory !== rule.categoryKeyword) {
      await this.assertNoDuplicate(nextBrand, nextCategory, id);
    }
    Object.assign(rule, dto);
    return this.repository.save(rule);
  }

  async remove(id: number): Promise<void> {
    const rule = await this.findOneOrFail(id);
    await this.repository.remove(rule);
  }
}
