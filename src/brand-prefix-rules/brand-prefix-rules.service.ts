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
  // PR-165부터 numericPattern으로 구분되는 여러 개(에잇세컨즈/뮤트 등)가 있을 수
  // 있으므로, "숫자시작이면 무조건 충돌"이 아니라 numericPattern까지 같을 때만(둘 다
  // 비어 있는 catch-all끼리, 또는 같은 패턴 문자열끼리) 충돌로 본다.
  private async assertNoConflict(
    dto: { prefix?: string; isNumericStart?: boolean; numericPattern?: string },
    excludeId?: number,
  ): Promise<void> {
    if (dto.isNumericStart) {
      const existing = await this.repository.find({ where: { isNumericStart: true } });
      const normalizedPattern = dto.numericPattern?.trim() || null;
      const conflict = existing.find((r) => r.id !== excludeId && (r.numericPattern ?? null) === normalizedPattern);
      if (conflict) {
        throw new BadRequestException(
          normalizedPattern
            ? `같은 패턴("${normalizedPattern}")의 숫자시작 규칙이 이미 등록되어 있습니다(브랜드: ${conflict.brandName}).`
            : `패턴 없는(catch-all) 숫자시작 규칙은 이미 등록되어 있습니다(브랜드: ${conflict.brandName}). 기존 규칙을 수정해 주세요.`,
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
      numericPattern: dto.isNumericStart ? dto.numericPattern ?? null : null,
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
    const nextNumericPattern = nextIsNumericStart ? dto.numericPattern ?? rule.numericPattern ?? undefined : undefined;
    await this.assertNoConflict({ prefix: nextPrefix, isNumericStart: nextIsNumericStart, numericPattern: nextNumericPattern }, id);

    rule.isNumericStart = nextIsNumericStart;
    rule.prefix = nextIsNumericStart ? null : nextPrefix!.toUpperCase();
    rule.numericPattern = nextIsNumericStart ? nextNumericPattern ?? null : null;
    if (dto.brandName !== undefined) rule.brandName = dto.brandName;
    if (dto.note !== undefined) rule.note = dto.note;

    return this.repository.save(rule);
  }

  async remove(id: number): Promise<void> {
    const rule = await this.findOneOrFail(id);
    await this.repository.remove(rule);
  }
}
