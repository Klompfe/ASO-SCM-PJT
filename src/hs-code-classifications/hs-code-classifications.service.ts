import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { HsCodeClassification } from './entities/hs-code-classification.entity';
import { StyleHsCodeMapping } from './entities/style-hs-code-mapping.entity';
import { CreateHsCodeClassificationDto } from './dto/create-hs-code-classification.dto';
import { GetHsCodeClassificationsFilterDto } from './dto/get-hs-code-classifications-filter.dto';
import { LookupHsCodeDto } from './dto/lookup-hs-code.dto';
import {
  HsCodeClassificationImportParser,
  ParsedHsCodeRow,
} from './utils/hs-code-classification-import-parser.util';

export interface HsCodeImportConflict {
  itemType: string;
  fabricType: string;
  composition: string;
  previousHsCode: string;
  newHsCode: string;
}

export interface HsCodeImportResult {
  totalRows: number;
  created: number;
  updated: number;
  conflicts: HsCodeImportConflict[];
}

@Injectable()
export class HsCodeClassificationsService {
  constructor(
    @InjectRepository(HsCodeClassification)
    private readonly classificationRepository: Repository<HsCodeClassification>,
    @InjectRepository(StyleHsCodeMapping)
    private readonly styleMappingRepository: Repository<StyleHsCodeMapping>,
  ) {}

  // 엑셀 임포트: (itemType, fabricType, composition) 조합으로 upsert하되, 기존
  // hsCode와 다르면 조용히 덮어쓰지 않고 conflicts에 기록한다(파일의 뒤쪽 행을
  // 최신으로 간주해 덮어쓰기 자체는 진행 — 요청 사양). styleNo가 있으면
  // StyleHsCodeMapping도 함께 upsert한다(같은 파일 내 styleNo 중복은 마지막
  // 값이 최종 반영됨 — Map에 순서대로 넣으므로 자연히 마지막 값이 남는다).
  async importFromExcel(buffer: Buffer): Promise<HsCodeImportResult> {
    const { rows } = HsCodeClassificationImportParser.parse(buffer);

    let created = 0;
    let updated = 0;
    const conflicts: HsCodeImportConflict[] = [];

    // styleNo 중복 시 마지막 값이 이기도록, 분류 upsert 이후 한 번에 정리한다.
    const styleNoToRow = new Map<string, ParsedHsCodeRow>();

    for (const row of rows) {
      const existing = await this.classificationRepository.findOne({
        where: {
          itemType: row.itemType,
          fabricType: row.fabricType,
          composition: row.composition,
        },
      });

      if (existing) {
        if (existing.hsCode !== row.hsCode) {
          conflicts.push({
            itemType: row.itemType,
            fabricType: row.fabricType,
            composition: row.composition,
            previousHsCode: existing.hsCode,
            newHsCode: row.hsCode,
          });
        }
        existing.hsCode = row.hsCode;
        existing.note = row.note;
        await this.classificationRepository.save(existing);
        updated++;
      } else {
        await this.classificationRepository.save(
          this.classificationRepository.create({
            itemType: row.itemType,
            fabricType: row.fabricType,
            composition: row.composition,
            hsCode: row.hsCode,
            note: row.note,
          }),
        );
        created++;
      }

      styleNoToRow.set(row.styleNo, row);
    }

    for (const row of styleNoToRow.values()) {
      const classification = await this.classificationRepository.findOneOrFail({
        where: {
          itemType: row.itemType,
          fabricType: row.fabricType,
          composition: row.composition,
        },
      });
      await this.upsertStyleMapping(row.styleNo, classification.id);
    }

    return { totalRows: rows.length, created, updated, conflicts };
  }

  // PR-082: import-shipments가 라인 저장 시 (itemType,fabricType,composition)으로
  // 조회하는 용도 — lookup()과 달리 없으면 예외 대신 null을 반환한다(호출 측에서
  // "HS코드 미확인" 상태를 표현해야 하므로 예외로 흐름을 끊으면 안 된다).
  async findMatch(
    itemType: string,
    fabricType: string,
    composition: string,
  ): Promise<HsCodeClassification | null> {
    return this.classificationRepository.findOne({ where: { itemType, fabricType, composition } });
  }

  // styleNo -> classification 매핑을 upsert한다(같은 styleNo가 다시 들어오면
  // 최신 classification으로 갱신) — 엑셀 임포트(위 importFromExcel)와 PR-082
  // import-shipments 양쪽에서 재사용한다.
  async upsertStyleMapping(styleNo: string, classificationId: number): Promise<StyleHsCodeMapping> {
    const existingMapping = await this.styleMappingRepository.findOne({ where: { styleNo } });

    if (existingMapping) {
      existingMapping.classificationId = classificationId;
      return this.styleMappingRepository.save(existingMapping);
    }
    return this.styleMappingRepository.save(
      this.styleMappingRepository.create({ styleNo, classificationId }),
    );
  }

  // PR-084: 화면에서 "이 스타일 이미 마스터에 있나?"를 목록만 보고도 알 수 있도록
  // 각 classification에 연결된 styleNo들을 붙여서 내려준다. N+1을 피하려고
  // 조회된 classification id들을 모아 StyleHsCodeMapping을 한 번에 IN(...) 조회해
  // 그룹핑한다(한 조합에 스타일이 여러 개 연결될 수 있음 — 드물지만 실제로 있다).
  async findAll(filter: GetHsCodeClassificationsFilterDto) {
    const qb = this.classificationRepository.createQueryBuilder('c');

    // ILIKE는 PostgreSQL 전용이라 테스트(SQLite)에서 문법 에러가 난다 —
    // LOWER() LIKE LOWER()는 양쪽 드라이버에서 동일하게 동작한다.
    if (filter.itemType) {
      qb.andWhere('LOWER(c.itemType) LIKE LOWER(:itemType)', {
        itemType: `%${filter.itemType}%`,
      });
    }
    if (filter.fabricType) {
      qb.andWhere('LOWER(c.fabricType) LIKE LOWER(:fabricType)', {
        fabricType: `%${filter.fabricType}%`,
      });
    }
    if (filter.composition) {
      qb.andWhere('LOWER(c.composition) LIKE LOWER(:composition)', {
        composition: `%${filter.composition}%`,
      });
    }
    if (filter.styleNo) {
      // 스타일번호로 검색할 때만 매핑 테이블을 조인한다 — 한 classification에
      // 매칭되는 매핑이 여러 개면 행이 중복될 수 있어 distinct로 정리한다.
      qb.innerJoin(StyleHsCodeMapping, 'm', 'm.classificationId = c.id').andWhere(
        'LOWER(m.styleNo) LIKE LOWER(:styleNo)',
        { styleNo: `%${filter.styleNo}%` },
      );
      qb.distinct(true);
    }

    qb.orderBy('c.itemType', 'ASC')
      .addOrderBy('c.fabricType', 'ASC')
      .skip(filter.skip)
      .take(filter.limit);

    const [items, total] = await qb.getManyAndCount();

    const ids = items.map((i) => i.id);
    const mappings = ids.length
      ? await this.styleMappingRepository.find({ where: { classificationId: In(ids) } })
      : [];
    const styleNosByClassificationId = new Map<number, string[]>();
    for (const mapping of mappings) {
      const list = styleNosByClassificationId.get(mapping.classificationId) ?? [];
      list.push(mapping.styleNo);
      styleNosByClassificationId.set(mapping.classificationId, list);
    }

    const itemsWithStyleNos = items.map((item) => ({
      ...item,
      styleNos: styleNosByClassificationId.get(item.id) ?? [],
    }));

    return { items: itemsWithStyleNos, total, page: filter.page ?? 1, limit: filter.limit ?? 10 };
  }

  // 관리 화면에서 1건 수동 등록/수정 — import와 동일한 upsert 규칙을 따른다
  // (같은 조합이면 hsCode/note 갱신, 없으면 신규 생성).
  async upsertOne(dto: CreateHsCodeClassificationDto): Promise<HsCodeClassification> {
    const existing = await this.classificationRepository.findOne({
      where: {
        itemType: dto.itemType,
        fabricType: dto.fabricType,
        composition: dto.composition,
      },
    });

    const row = existing
      ? Object.assign(existing, { hsCode: dto.hsCode, note: dto.note ?? null })
      : this.classificationRepository.create({
          itemType: dto.itemType,
          fabricType: dto.fabricType,
          composition: dto.composition,
          hsCode: dto.hsCode,
          note: dto.note ?? null,
        });

    return this.classificationRepository.save(row);
  }

  // PR-141: 삭제 — style_hs_code_mappings.classificationId FK가 이미 ON DELETE CASCADE로
  // 걸려 있어(1789321811717-CreateHsCodeClassifications.ts) 분류를 지우면 그 분류에 연결된
  // 매핑도 DB가 함께 지운다. 스타일 삭제(styles.service.ts remove())가 하위 데이터를 전부
  // cascade로 지우는 것과 같은 방침 — "매핑이 있으면 막는다"로 하면 이 FK 설계와 어긋난다.
  async remove(id: number): Promise<void> {
    const existing = await this.classificationRepository.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`ID가 ${id}인 HS코드 분류를 찾을 수 없습니다.`);
    }
    await this.classificationRepository.delete(id);
  }

  async lookup(dto: LookupHsCodeDto): Promise<HsCodeClassification> {
    const found = await this.classificationRepository.findOne({
      where: {
        itemType: dto.itemType,
        fabricType: dto.fabricType,
        composition: dto.composition,
      },
    });

    if (!found) {
      throw new NotFoundException('일치하는 HS코드 분류를 찾을 수 없습니다.');
    }
    return found;
  }

  async findByStyle(styleNo: string): Promise<HsCodeClassification> {
    const mapping = await this.styleMappingRepository.findOne({
      where: { styleNo },
      relations: ['classification'],
    });

    if (!mapping) {
      throw new NotFoundException('해당 Style No에 대한 HS코드 매핑을 찾을 수 없습니다.');
    }
    return mapping.classification;
  }
}
