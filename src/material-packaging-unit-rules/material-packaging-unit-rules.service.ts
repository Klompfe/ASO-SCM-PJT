import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaterialPackagingUnitRule } from './entities/material-packaging-unit-rule.entity';
import { CreateMaterialPackagingUnitRuleDto } from './dto/create-material-packaging-unit-rule.dto';
import { UpdateMaterialPackagingUnitRuleDto } from './dto/update-material-packaging-unit-rule.dto';

@Injectable()
export class MaterialPackagingUnitRulesService {
  constructor(
    @InjectRepository(MaterialPackagingUnitRule)
    private readonly repository: Repository<MaterialPackagingUnitRule>,
  ) {}

  async findAll(): Promise<MaterialPackagingUnitRule[]> {
    return this.repository.find({ order: { id: 'ASC' } });
  }

  // PR-175: thread-cone-price.util.ts의 calculateConePriceUsd()가 쓰는 조회 형태
  // (materialSubType → 미터 길이) — 호출 시점에 한 번 불러와 순수 계산 함수에
  // 넘기는 용도.
  async findAllAsLengthMap(): Promise<Record<string, number>> {
    const rules = await this.findAll();
    return Object.fromEntries(rules.map((r) => [r.materialSubType, Number(r.unitLengthM)]));
  }

  private async assertNoDuplicate(materialSubType: string, excludeId?: number): Promise<void> {
    const existing = await this.repository.findOne({ where: { materialSubType } });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException(`자재 종류 "${materialSubType}"는 이미 등록되어 있습니다(표시명: ${existing.displayName}).`);
    }
  }

  async create(dto: CreateMaterialPackagingUnitRuleDto): Promise<MaterialPackagingUnitRule> {
    await this.assertNoDuplicate(dto.materialSubType);
    const rule = this.repository.create({ ...dto, note: dto.note ?? null });
    return this.repository.save(rule);
  }

  private async findOneOrFail(id: number): Promise<MaterialPackagingUnitRule> {
    const rule = await this.repository.findOne({ where: { id } });
    if (!rule) {
      throw new NotFoundException(`ID가 ${id}인 자재 포장단위 규칙을 찾을 수 없습니다.`);
    }
    return rule;
  }

  async update(id: number, dto: UpdateMaterialPackagingUnitRuleDto): Promise<MaterialPackagingUnitRule> {
    const rule = await this.findOneOrFail(id);
    if (dto.materialSubType !== undefined && dto.materialSubType !== rule.materialSubType) {
      await this.assertNoDuplicate(dto.materialSubType, id);
    }
    Object.assign(rule, dto);
    return this.repository.save(rule);
  }

  async remove(id: number): Promise<void> {
    const rule = await this.findOneOrFail(id);
    await this.repository.remove(rule);
  }
}
