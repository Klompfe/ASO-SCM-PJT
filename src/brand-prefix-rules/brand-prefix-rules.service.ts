import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrandPrefixRule } from './entities/brand-prefix-rule.entity';
import { CreateBrandPrefixRuleDto } from './dto/create-brand-prefix-rule.dto';
import { UpdateBrandPrefixRuleDto } from './dto/update-brand-prefix-rule.dto';

@Injectable()
export class BrandPrefixRulesService {
  constructor(
    @InjectRepository(BrandPrefixRule)
    private readonly repository: Repository<BrandPrefixRule>,
  ) {}

  async findAll(): Promise<BrandPrefixRule[]> {
    return this.repository.find({ order: { id: 'ASC' } });
  }

  // 접두사 규칙끼리(대소문자 무시) 겹치면 classifyBrand()가 항상 먼저 등록된 쪽만
  // 골라 다른 규칙이 죽은 데이터가 되므로, 저장 시점에 막는다. 숫자시작 규칙은
  // 개념상 하나만 있으면 되므로(스타일번호가 숫자로 시작하는 경우는 하나의 규칙만
  // 적용 가능) 중복 등록을 막는다.
  private async assertNoConflict(dto: { prefix?: string; isNumericStart?: boolean }, excludeId?: number): Promise<void> {
    if (dto.isNumericStart) {
      const existing = await this.repository.find({ where: { isNumericStart: true } });
      const conflict = existing.find((r) => r.id !== excludeId);
      if (conflict) {
        throw new BadRequestException(
          `숫자시작 규칙은 이미 등록되어 있습니다(브랜드: ${conflict.brandName}). 기존 규칙을 수정해 주세요.`,
        );
      }
      return;
    }

    if (dto.prefix) {
      const existing = await this.repository.find();
      const conflict = existing.find(
        (r) => r.id !== excludeId && !r.isNumericStart && r.prefix?.toUpperCase() === dto.prefix!.toUpperCase(),
      );
      if (conflict) {
        throw new BadRequestException(
          `접두사 "${dto.prefix.toUpperCase()}"는 이미 등록되어 있습니다(브랜드: ${conflict.brandName}).`,
        );
      }
    }
  }

  async create(dto: CreateBrandPrefixRuleDto): Promise<BrandPrefixRule> {
    await this.assertNoConflict(dto);
    const rule = this.repository.create({
      prefix: dto.isNumericStart ? null : dto.prefix!.toUpperCase(),
      isNumericStart: dto.isNumericStart ?? false,
      brandName: dto.brandName,
      note: dto.note ?? null,
    });
    return this.repository.save(rule);
  }

  private async findOneOrFail(id: number): Promise<BrandPrefixRule> {
    const rule = await this.repository.findOne({ where: { id } });
    if (!rule) {
      throw new NotFoundException(`ID가 ${id}인 브랜드 규칙을 찾을 수 없습니다.`);
    }
    return rule;
  }

  async update(id: number, dto: UpdateBrandPrefixRuleDto): Promise<BrandPrefixRule> {
    const rule = await this.findOneOrFail(id);

    const nextIsNumericStart = dto.isNumericStart ?? rule.isNumericStart;
    const nextPrefix = nextIsNumericStart ? undefined : (dto.prefix ?? rule.prefix ?? undefined);
    if (!nextIsNumericStart && !nextPrefix) {
      throw new BadRequestException('isNumericStart가 아니면 prefix는 필수입니다.');
    }
    await this.assertNoConflict({ prefix: nextPrefix, isNumericStart: nextIsNumericStart }, id);

    rule.isNumericStart = nextIsNumericStart;
    rule.prefix = nextIsNumericStart ? null : nextPrefix!.toUpperCase();
    if (dto.brandName !== undefined) rule.brandName = dto.brandName;
    if (dto.note !== undefined) rule.note = dto.note;

    return this.repository.save(rule);
  }

  async remove(id: number): Promise<void> {
    const rule = await this.findOneOrFail(id);
    await this.repository.remove(rule);
  }
}
