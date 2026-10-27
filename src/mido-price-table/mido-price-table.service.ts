import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { MidoPriceItem } from './entities/mido-price-item.entity';
import { MaterialPackagingUnitRulesService } from '../material-packaging-unit-rules/material-packaging-unit-rules.service';
import { MaterialPackagingUnitRule } from '../material-packaging-unit-rules/entities/material-packaging-unit-rule.entity';
import { classifyPackagingUnit, convertMeterPriceToUnitPrice, type PackagingUnitCategory } from '../export-shipments/utils/meter-price-conversion.util';
import { CreateMidoPriceItemDto } from './dto/create-mido-price-item.dto';
import { UpdateMidoPriceItemDto } from './dto/update-mido-price-item.dto';
import { parseMidoPriceCsv, MidoPriceCsvParseError, type ParsedMidoPriceCsvRow } from './utils/mido-price-csv-parser.util';
import { ImportMidoPriceApplyRowDto } from './dto/import-mido-price-apply.dto';

// PR-157: PurchaseOrder.unitPrice(원화)가 없는 자재의 USD 단가 fallback. 아이템명
// 매칭이 완전히 일치하지 않을 수 있어(자재명세 표기 vs 단가표 표기) 자동으로 하나를
// 확정하지 않고, 느슨한 부분일치로 후보를 전부 반환한다 — 담당자가 화면에서 직접 골라
// 연결한다(PR-156의 "후보 전부 보여주고 자동 확정 금지" 원칙과 동일).

// PR-182: 환산 후보 — determined=true면 BomItem.threadType/tapeType으로 종류가 확정돼
// 환산 가능한 값이 하나뿐이고, false면(종류 미지정) 가능한 종류별 값을 전부 나열한다.
// 어느 쪽이든 서버는 하나를 자동으로 고르지 않는다(options 중 하나를 사람이 고른다).
export interface MeterPriceConversionOption {
  materialSubType: string;
  displayName: string;
  packagingUnitLabel: string;
  unitLengthM: number;
  unitPriceUsd: number;
  formula: string;
  unitPriceUsdMax?: number;
  formulaMax?: string;
}

export interface MeterPriceConversionInfo {
  determined: boolean;
  options: MeterPriceConversionOption[];
  warning?: string;
}

export interface MidoPriceCandidateWithConversion extends MidoPriceItem {
  conversion?: MeterPriceConversionInfo;
}

// PR-188: 일괄 등록 미리보기 — 파일의 각 행을 기존 데이터와 비교해 분류한다. 자동 적용은
// 하지 않는다(사람이 NEW/CHANGED 중 고른 행만 선택 적용). itemName이 완전히 일치하는
// 행만 "같은 항목"으로 본다(퍼지 매칭 금지 — 요구사항).
export interface MidoPriceImportPreviewRow {
  line: number;
  status: 'NEW' | 'CHANGED' | 'SAME' | 'ERROR';
  before?: { priceUsdMin: number; priceUsdMax: number; unit: string; note: string | null };
  after: { itemName: string; priceUsdMin: number | null; priceUsdMax: number | null; unit: string; note: string | null };
  errors?: string[];
}

export interface MidoPriceImportPreviewResult {
  rows: MidoPriceImportPreviewRow[];
  summary: { new: number; changed: number; same: number; error: number; total: number };
}

const MISSING_SUBTYPE_WARNING = '실/테이프 종류 미지정 — 선택해 주세요';

// PR-204: 자재명을 "단어" 토큰으로 쪼갠다 — 단가표 itemName과의 부분일치 비교에 쓴다.
// 구분 문자로만 취급하는 집합을 이 한 곳에서만 관리한다(괄호류 전부 포함: "암홀<실크>"도
// "암홀(실크)"와 같은 토큰으로 쪼개져야 한다). 전면적인 "문자/숫자 아니면 전부 구분자"로
// 바꾸지 않는다 — "100%"처럼 하나로 남아야 하는 토큰이 부풀어 오매칭이 늘 위험이 있다.
export function tokenizeMaterialName(materialName: string): string[] {
  return materialName
    .replace(/[()<>[\]{}"/,]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}
// PR-185: "이전 INVOICE는 TAPE 10MM을 $0.04로 일괄 청구함" 안내 문구는 실제로는 단가표
// 기준(다데 $0.04/롤, 암홀 $0.50/롤)으로 각각 계산해야 하는데 과거 관행을 그대로 따르는
// 것으로 오해할 수 있어 제거했다(제시님 결정) — 종류 미지정이어도 두 후보를 그대로 나열만 한다.

@Injectable()
export class MidoPriceTableService {
  private readonly logger = new Logger(MidoPriceTableService.name);

  constructor(
    @InjectRepository(MidoPriceItem)
    private readonly repository: Repository<MidoPriceItem>,
    private readonly packagingUnitRulesService: MaterialPackagingUnitRulesService,
    private readonly dataSource: DataSource,
  ) {}

  // PR-188: 관리 화면(includeInactive=true)은 전체를 보여주고, 후보 검색/INVOICE 등
  // 내부 조회(기본값)는 isActive=true인 행만 쓴다(삭제 대신 사용 중지만 가능하므로).
  async findAll(includeInactive = false): Promise<MidoPriceItem[]> {
    return this.repository.find({
      ...(includeInactive ? {} : { where: { isActive: true } }),
      order: { itemName: 'ASC' },
    });
  }

  // materialName의 각 "단어"(공백/괄호로 대충 쪼갠 토큰)가 단가표 itemName에 포함되어
  // 있으면 후보로 본다 — 완전 일치를 요구하면 "겉감(폴리에스터 57"/58" 혼방)" 같은
  // 표기 차이 때문에 후보가 하나도 안 나올 위험이 크다.
  //
  // PR-182: opts.lineUnit이 콘/롤이고 후보 단위가 M이면, material-packaging-unit-rules를
  // 조회해 콘/롤단가 환산 후보를 conversion으로 함께 붙인다. opts.materialSubType이
  // 있으면(BomItem.threadType/tapeType) 그 종류 하나로만 환산하고, 없으면 같은 포장
  // 단위(콘=실류/롤=테이프류) 범주의 모든 종류를 나열해 사람이 고르게 한다.
  async findCandidates(
    materialName: string,
    opts?: { lineUnit?: string; materialSubType?: string },
  ): Promise<MidoPriceCandidateWithConversion[]> {
    const all = await this.findAll();
    const tokens = tokenizeMaterialName(materialName);

    if (tokens.length === 0) return [];

    const candidates = all.filter((item) => tokens.some((t) => item.itemName.includes(t)));

    const category = classifyPackagingUnit(opts?.lineUnit);
    if (!category) return candidates; // 라인 단위가 콘/롤이 아니면(M 등) 환산하지 않는다 — 기존 동작 그대로.

    const rules = await this.packagingUnitRulesService.findAll();
    return candidates.map((c) => {
      if (c.unit.toUpperCase() !== 'M') return c; // 단가표 단위가 M이 아니면 환산 대상이 아니다.
      return { ...c, conversion: this.buildConversion(c, category, rules, opts?.materialSubType) };
    });
  }

  private buildConversion(
    candidate: MidoPriceItem,
    category: PackagingUnitCategory,
    rules: MaterialPackagingUnitRule[],
    materialSubType: string | undefined,
  ): MeterPriceConversionInfo {
    const toOption = (rule: MaterialPackagingUnitRule): MeterPriceConversionOption => {
      const lengthM = Number(rule.unitLengthM);
      const min = convertMeterPriceToUnitPrice(Number(candidate.priceUsdMin), lengthM, rule.packagingUnitLabel);
      const differs = Number(candidate.priceUsdMax) !== Number(candidate.priceUsdMin);
      const max = differs ? convertMeterPriceToUnitPrice(Number(candidate.priceUsdMax), lengthM, rule.packagingUnitLabel) : null;
      return {
        materialSubType: rule.materialSubType,
        displayName: rule.displayName,
        packagingUnitLabel: rule.packagingUnitLabel,
        unitLengthM: lengthM,
        unitPriceUsd: min.unitPrice,
        formula: min.formula,
        ...(max ? { unitPriceUsdMax: max.unitPrice, formulaMax: max.formula } : {}),
      };
    };

    if (materialSubType) {
      const rule = rules.find((r) => r.materialSubType === materialSubType);
      if (rule) {
        return { determined: true, options: [toOption(rule)] };
      }
      // 종류는 알지만 포장단위 규칙이 없는 경우(데이터 누락) — 추측해서 환산하지 않고
      // 아래의 "미지정" 처리로 안전하게 넘어간다.
    }

    const categoryRules = rules.filter((r) => classifyPackagingUnit(r.packagingUnitLabel) === category);
    // 실(THREAD)처럼 종류와 무관하게 미터단가가 하나뿐이면(단가표에 후보가 한 줄) 그
    // 하나의 가격을 종류별 길이로 각각 곱해 전부 보여준다(스펙 예시와 동일). 반면
    // 테이프는 다데/암홀의 미터단가 자체가 다르므로(이 후보가 어느 미터단가인지는
    // candidate.itemName에 드러난다) 이 후보의 이름에 실제로 등장하는 종류로만
    // 좁힌다 — 그래야 "다데 가격 × 암홀 길이" 같은 틀린 조합을 보여주지 않는다.
    const nameMatchedRules = categoryRules.filter((r) => candidate.itemName.includes(r.displayName));
    const rulesToUse = nameMatchedRules.length > 0 ? nameMatchedRules : categoryRules;
    return {
      determined: false,
      options: rulesToUse.map(toOption),
      warning: MISSING_SUBTYPE_WARNING,
    };
  }

  // PR-188: itemName 중복 저장을 막는다 — 미리보기(preview)가 같은 itemName을 "같은
  // 항목"으로 보는 것과 같은 기준(완전 일치), 추측 매칭 없음.
  private async assertNoDuplicateItemName(itemName: string, excludeId?: number): Promise<void> {
    const existing = await this.repository.findOne({ where: { itemName } });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException(`이미 등록된 항목명입니다: ${itemName}`);
    }
  }

  private assertMinLessEqualMax(priceUsdMin: number, priceUsdMax: number): void {
    if (priceUsdMin > priceUsdMax) {
      throw new BadRequestException('priceUsdMin은 priceUsdMax보다 클 수 없습니다.');
    }
  }

  async create(dto: CreateMidoPriceItemDto): Promise<MidoPriceItem> {
    const itemName = dto.itemName.trim();
    if (!itemName) throw new BadRequestException('itemName은 비어 있을 수 없습니다.');
    await this.assertNoDuplicateItemName(itemName);
    this.assertMinLessEqualMax(dto.priceUsdMin, dto.priceUsdMax);
    const item = this.repository.create({
      itemName,
      priceUsdMin: dto.priceUsdMin,
      priceUsdMax: dto.priceUsdMax,
      unit: dto.unit,
      note: dto.note ?? null,
      isActive: true,
    });
    return this.repository.save(item);
  }

  private async findOneOrFail(id: number): Promise<MidoPriceItem> {
    const item = await this.repository.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`ID가 ${id}인 단가표 항목을 찾을 수 없습니다.`);
    return item;
  }

  async update(id: number, dto: UpdateMidoPriceItemDto): Promise<MidoPriceItem> {
    const item = await this.findOneOrFail(id);
    if (dto.itemName !== undefined) {
      const itemName = dto.itemName.trim();
      if (!itemName) throw new BadRequestException('itemName은 비어 있을 수 없습니다.');
      if (itemName !== item.itemName) await this.assertNoDuplicateItemName(itemName, id);
      item.itemName = itemName;
    }
    const nextMin = dto.priceUsdMin ?? Number(item.priceUsdMin);
    const nextMax = dto.priceUsdMax ?? Number(item.priceUsdMax);
    this.assertMinLessEqualMax(nextMin, nextMax);
    if (dto.priceUsdMin !== undefined) item.priceUsdMin = dto.priceUsdMin;
    if (dto.priceUsdMax !== undefined) item.priceUsdMax = dto.priceUsdMax;
    if (dto.unit !== undefined) item.unit = dto.unit;
    if (dto.note !== undefined) item.note = dto.note;
    if (dto.isActive !== undefined) item.isActive = dto.isActive;
    return this.repository.save(item);
  }

  // PR-188: 미리보기 — DB에 쓰지 않는다. itemName이 완전히 일치하는 기존 행과 비교해
  // NEW(신규)/CHANGED(값이 다름)/SAME(완전히 동일)/ERROR(형식 오류 또는 파일 내 중복)로
  // 분류한다. CSV 파싱 자체가 실패하면(헤더 누락 등) BadRequestException이 그대로 던져진다.
  async importPreview(csv: string): Promise<MidoPriceImportPreviewResult> {
    let parsed: { rows: ParsedMidoPriceCsvRow[] };
    try {
      parsed = parseMidoPriceCsv(csv);
    } catch (e) {
      if (e instanceof MidoPriceCsvParseError) throw new BadRequestException(e.message);
      throw e;
    }
    if (parsed.rows.length > 500) {
      throw new BadRequestException(`한 번에 최대 500행까지 등록할 수 있습니다(현재 ${parsed.rows.length}행).`);
    }

    const existingAll = await this.repository.find();
    const existingByName = new Map(existingAll.map((r) => [r.itemName, r]));

    const rows: MidoPriceImportPreviewRow[] = parsed.rows.map((r) => {
      const after = { itemName: r.itemName, priceUsdMin: r.priceUsdMin, priceUsdMax: r.priceUsdMax, unit: r.unit, note: r.note };
      if (r.errors.length > 0) {
        return { line: r.line, status: 'ERROR' as const, after, errors: r.errors };
      }
      const existing = existingByName.get(r.itemName);
      if (!existing) {
        return { line: r.line, status: 'NEW' as const, after };
      }
      const before = { priceUsdMin: Number(existing.priceUsdMin), priceUsdMax: Number(existing.priceUsdMax), unit: existing.unit, note: existing.note ?? null };
      const same =
        before.priceUsdMin === r.priceUsdMin &&
        before.priceUsdMax === r.priceUsdMax &&
        before.unit === r.unit &&
        (before.note ?? null) === (r.note ?? null);
      return { line: r.line, status: same ? ('SAME' as const) : ('CHANGED' as const), before, after };
    });

    const summary = {
      new: rows.filter((r) => r.status === 'NEW').length,
      changed: rows.filter((r) => r.status === 'CHANGED').length,
      same: rows.filter((r) => r.status === 'SAME').length,
      error: rows.filter((r) => r.status === 'ERROR').length,
      total: rows.length,
    };
    return { rows, summary };
  }

  // PR-188: 미리보기에서 사람이 선택한 NEW/CHANGED 행만 적용한다. all-or-nothing —
  // 서버가 다시 검증(itemName 재중복 등)해서 하나라도 걸리면 전부 거절, 트랜잭션으로
  // upsert한다(파일에 없는 기존 행은 건드리지 않는다). 삭제는 하지 않는다.
  async importApply(rows: ImportMidoPriceApplyRowDto[]): Promise<{ created: number; updated: number }> {
    if (!rows || rows.length === 0) {
      throw new BadRequestException('적용할 항목이 없습니다.');
    }
    if (rows.length > 500) {
      throw new BadRequestException(`한 번에 최대 500행까지 적용할 수 있습니다(현재 ${rows.length}행).`);
    }

    const names = rows.map((r) => r.itemName.trim());
    const dupInFile = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupInFile.length > 0) {
      throw new BadRequestException(`선택한 행에 같은 itemName이 중복됩니다: ${[...new Set(dupInFile)].join(', ')}`);
    }
    for (const row of rows) {
      if (!row.itemName.trim()) throw new BadRequestException('itemName은 비어 있을 수 없습니다.');
      if (!row.unit.trim()) throw new BadRequestException(`itemName "${row.itemName}": unit은 비어 있을 수 없습니다.`);
      if (row.priceUsdMin > row.priceUsdMax) {
        throw new BadRequestException(`itemName "${row.itemName}": priceUsdMin은 priceUsdMax보다 클 수 없습니다.`);
      }
    }

    const existingAll = await this.repository.find();
    const existingByName = new Map(existingAll.map((r) => [r.itemName, r]));

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      let created = 0;
      let updated = 0;
      for (const row of rows) {
        const existing = existingByName.get(row.itemName.trim());
        if (existing) {
          existing.priceUsdMin = row.priceUsdMin;
          existing.priceUsdMax = row.priceUsdMax;
          existing.unit = row.unit;
          existing.note = row.note ?? null;
          await queryRunner.manager.save(existing);
          updated++;
        } else {
          const created_ = queryRunner.manager.create(MidoPriceItem, {
            itemName: row.itemName.trim(),
            priceUsdMin: row.priceUsdMin,
            priceUsdMax: row.priceUsdMax,
            unit: row.unit,
            note: row.note ?? null,
            isActive: true,
          });
          await queryRunner.manager.save(created_);
          created++;
        }
      }
      await queryRunner.commitTransaction();
      this.logger.log(`미도 단가표 일괄 등록 적용: 생성 ${created}건, 수정 ${updated}건`);
      return { created, updated };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
