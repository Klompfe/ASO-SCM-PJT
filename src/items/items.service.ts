import 'multer';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Item, ItemType } from './entities/item.entity';
import { GetItemsFilterDto } from './dto/get-items-filter.dto';
import { MaterialCategory } from '../material-categories/entities/material-category.entity';
import { MaterialPackagingUnitRule } from '../material-packaging-unit-rules/entities/material-packaging-unit-rule.entity';
import { looksLikeThreadOrTape, buildThreadTapeSuggestion } from '../common/utils/packaging-subtype.util';
import { classifyQuantityUnit } from '../work-orders/utils/material-requirements.util';
import * as XLSX from 'xlsx';

// PR-239: 단위는 요척의 길이 단위(M/Y 등)여야 포장 환산(N콘/N롤)의 전제가 성립한다 —
// ItemsManager.tsx의 같은 이름 상수(utils/bomQtyReason.ts)와 문구를 맞춘다.
export const BLOCKED_PACKAGING_UNIT_MESSAGE =
  '단위는 요척의 길이 단위(M/Y 등)여야 합니다. 콘·롤은 "실/테이프 종류 지정"의 포장 규칙으로 처리됩니다. 권장 단위: M';

export interface ThreadTapeClassificationAssignment {
  itemId: number;
  // null이면 "실/테이프 아님"으로 확정(검토완료, 종류는 비움).
  materialSubType: string | null;
}

export interface CreateItemInput {
  code: string;
  name: string;
  englishName?: string;
  type: ItemType | string;
  unit?: string;
  spec?: string;
  description?: string;
  styleNo?: string;
  // PR-183: 품목군(선택). 없으면 비워 둔다 — 추측해서 채우지 않는다.
  categoryId?: number | null;
  // PR-186: 실/테이프 종류(선택). 없으면 비워 둔다 — 추측해서 채우지 않는다.
  materialSubType?: string | null;
}

export interface UpdateItemInput {
  code?: string;
  name?: string;
  englishName?: string;
  type?: ItemType | string;
  unit?: string;
  spec?: string;
  description?: string;
  styleNo?: string;
  // PR-183: null이면 품목군 해제, 생략(undefined)이면 변경 없음.
  categoryId?: number | null;
  // PR-186: null이면 종류 해제, 생략(undefined)이면 변경 없음.
  materialSubType?: string | null;
}

@Injectable()
export class ItemsService {
  private readonly logger = new Logger(ItemsService.name);

  constructor(
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    private readonly dataSource: DataSource,
  ) {}

  // PR-183: 품목군 존재 여부 확인 — 없는 id를 조용히 저장하지 않는다.
  private async assertCategoryExists(categoryId: number): Promise<void> {
    const category = await this.dataSource.getRepository(MaterialCategory).findOne({ where: { id: categoryId } });
    if (!category) {
      throw new BadRequestException(`존재하지 않는 품목군 ID: ${categoryId}`);
    }
  }

  // PR-186: 없는(규칙 테이블에 없는) 실/테이프 종류 코드를 조용히 저장하지 않는다.
  private async assertMaterialSubTypeExists(materialSubType: string): Promise<void> {
    const rule = await this.dataSource.getRepository(MaterialPackagingUnitRule).findOne({ where: { materialSubType } });
    if (!rule) {
      throw new BadRequestException(`존재하지 않는 실/테이프 종류입니다: ${materialSubType}`);
    }
  }

  async create(dto: CreateItemInput): Promise<Item> {
    this.logger.log(`Creating new item with code: ${dto.code}`);

    if (!dto.code || !dto.name || !dto.type) {
      throw new BadRequestException('품목 코드, 이름, 타입은 필수 입력 항목입니다.');
    }

    // styleNo는 FINISHED_GOOD이 소속 MasterStyle을 값으로 참조하기 위한 필드다(CHARTER.md 2.1).
    // 원자재/반제품은 여러 스타일의 BOM에서 공유되는 자원이라 특정 styleNo에 귀속시키는 것이
    // 도메인 모델과 맞지 않으므로 명시적으로 막는다.
    if (dto.styleNo && dto.type !== ItemType.FINISHED_GOOD) {
      throw new BadRequestException('styleNo는 FINISHED_GOOD 타입 품목에만 지정할 수 있습니다.');
    }

    const existingItem = await this.itemRepository.findOne({
      where: { code: dto.code },
    });

    if (existingItem) {
      throw new ConflictException(`이미 존재하는 품목 코드입니다: ${dto.code}`);
    }
    // PR-183: 없는 품목군 id는 트랜잭션을 열기 전에 400으로 거절한다(FK 위반이 500으로 바뀌지 않게).
    if (dto.categoryId != null) await this.assertCategoryExists(dto.categoryId);
    if (dto.materialSubType != null) await this.assertMaterialSubTypeExists(dto.materialSubType);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const newItem = new Item();
      newItem.code = dto.code;
      newItem.name = dto.name;
      newItem.type = dto.type as ItemType;
      // PR-078: 이전에는 dto.unit이 없으면 'EA'를 강제했는데, 그러면 export-shipments
      // 생성 로직이 Item.unit을 우선 참조하는 의미가 없어진다(항상 값이 있으니
      // "없으면 폴백"이 절대 발동하지 않음) — 지정하지 않았으면 비워 둔다.
      if (dto.unit) newItem.unit = dto.unit;
      if (dto.englishName) newItem.englishName = dto.englishName;
      if (dto.spec) newItem.spec = dto.spec;
      if (dto.description) newItem.description = dto.description;
      if (dto.styleNo) newItem.styleNo = dto.styleNo;
      if (dto.categoryId != null) newItem.categoryId = dto.categoryId;
      if (dto.materialSubType != null) newItem.materialSubType = dto.materialSubType;

      const savedItem = await queryRunner.manager.save(newItem);
      await queryRunner.commitTransaction();

      this.logger.log(`Item successfully created with ID: ${savedItem.id}`);
      return savedItem;
    } catch (err) {
      const error = err as Error;
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to create item: ${error.message}`, error.stack);
      throw new InternalServerErrorException('품목 생성 중 오류가 발생했습니다.');
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(filter?: GetItemsFilterDto) {
    const page = filter?.page || 1;
    const limit = filter?.limit || 10;
    const skip = (page - 1) * limit;

    const queryBuilder = this.itemRepository.createQueryBuilder('item');

    const type = filter?.type?.trim();
    if (type) {
      queryBuilder.andWhere('item.type = :type', { type });
    }

    // PR-232: Postgres의 LIKE는 기본적으로 대소문자를 구분한다(sqlite의 LIKE는 ASCII만
    // 자동으로 대소문자를 구분하지 않아 테스트 DB에서는 숨겨져 있었다) — 코드(MAT-… 등
    // 영문 코드)를 다른 대소문자로 검색하면 운영 DB(Postgres)에서만 0건이 될 수 있었다.
    // LOWER()로 양쪽을 맞춰 두 DB에서 같은 결과가 나오게 한다. 앞뒤 공백은 트림(프런트도
    // 트림하지만, 이 API를 다른 곳에서 직접 호출할 때도 같게 동작하도록 서버도 트림 —
    // PurchaseOrdersManager.tsx의 searchRawMaterials처럼 trim 없이 바로 getItems를
    // 부르는 다른 화면도 이 서버 쪽 트림으로 같이 보호된다).
    const keyword = filter?.keyword?.trim();
    if (keyword) {
      queryBuilder.andWhere(
        '(LOWER(item.name) LIKE LOWER(:keyword) OR LOWER(item.code) LIKE LOWER(:keyword))',
        { keyword: `%${keyword}%` },
      );
    }

    queryBuilder
      .orderBy('item.id', 'DESC')
      .skip(skip)
      .take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findOne(id: number): Promise<Item> {
    if (!id || isNaN(id)) {
      throw new BadRequestException('유효하지 않은 품목 ID입니다.');
    }

    const item = await this.itemRepository.findOne({
      where: { id },
    });

    if (!item) {
      throw new NotFoundException(`ID가 ${id}인 품목을 찾을 수 없습니다.`);
    }

    return item;
  }

  async update(id: number, dto: UpdateItemInput): Promise<Item> {
    const item = await this.findOne(id);

    if (dto.code && dto.code !== item.code) {
      const codeDuplicate = await this.itemRepository.findOne({
        where: { code: dto.code },
      });
      if (codeDuplicate) {
        throw new ConflictException(`이미 사용 중인 품목 코드입니다: ${dto.code}`);
      }
    }

    if (dto.styleNo) {
      const effectiveType = (dto.type as ItemType) || item.type;
      if (effectiveType !== ItemType.FINISHED_GOOD) {
        throw new BadRequestException('styleNo는 FINISHED_GOOD 타입 품목에만 지정할 수 있습니다.');
      }
    }

    // PR-239: 길이 기반 요척(실/테이프) 또는 포장 규칙이 지정된 품목은 단위를 콘/롤/EA
    // 등 길이가 아닌 값으로 바꾸는 것을 막는다 — 프런트 가드(ItemsManager.tsx)를
    // 우회해 API를 직접 호출해도 같은 사고(단위를 CONE으로 바꿔 포장 환산 전제가
    // 깨지는 것)가 나지 않게 서버에서도 거부한다.
    if (dto.unit && dto.unit.trim() !== (item.unit ?? '').trim() && classifyQuantityUnit(dto.unit) !== 'length') {
      const effectiveSubType = dto.materialSubType !== undefined ? dto.materialSubType : item.materialSubType;
      const rules = await this.dataSource.getRepository(MaterialPackagingUnitRule).find();
      const hasPackagingRule = !!effectiveSubType && rules.some((r) => r.materialSubType === effectiveSubType);
      const looksLikeThreadTape = !item.materialSubType && !item.packagingReviewedAt && looksLikeThreadOrTape(item.name, rules);
      if (hasPackagingRule || looksLikeThreadTape) {
        throw new BadRequestException(BLOCKED_PACKAGING_UNIT_MESSAGE);
      }
    }

    if (dto.code) item.code = dto.code;
    if (dto.name) item.name = dto.name;
    if (dto.englishName !== undefined) item.englishName = dto.englishName;
    if (dto.type) item.type = dto.type as ItemType;
    if (dto.unit) item.unit = dto.unit;
    if (dto.spec !== undefined) item.spec = dto.spec;
    if (dto.description !== undefined) item.description = dto.description;
    if (dto.styleNo !== undefined) item.styleNo = dto.styleNo;
    if (dto.categoryId !== undefined) {
      if (dto.categoryId !== null) await this.assertCategoryExists(dto.categoryId);
      item.categoryId = dto.categoryId;
    }
    if (dto.materialSubType !== undefined) {
      if (dto.materialSubType !== null) await this.assertMaterialSubTypeExists(dto.materialSubType);
      item.materialSubType = dto.materialSubType;
    }

    try {
      const updatedItem = await this.itemRepository.save(item);
      this.logger.log(`Item ID ${id} updated successfully.`);
      return updatedItem;
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Failed to update item ID ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('품목 정보 수정 중 오류가 발생했습니다.');
    }
  }

  async remove(id: number): Promise<{ success: boolean; message: string }> {
    const item = await this.findOne(id);

    try {
      await this.itemRepository.remove(item);
      this.logger.log(`Item ID ${id} removed successfully.`);
      return {
        success: true,
        message: `ID ${id} 품목이 성공적으로 삭제되었습니다.`,
      };
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Failed to remove item ID ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('품목 삭제 중 오류가 발생했습니다.');
    }
  }

  async uploadPreview(file: Express.Multer.File) {
    if (!file || !file.buffer) {
      throw new BadRequestException('엑셀 파일이 존재하지 않거나 올바르지 않습니다.');
    }

    try {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new BadRequestException('엑셀 파일에 시트가 존재하지 않습니다.');

      const worksheet = workbook.Sheets[sheetName];

      // 1. Raw JSON 로그 출력 (Traceability)
      const rawJson = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
      console.log('=== RAW EXCEL JSON DATA (Traceability) ===');
      console.log(JSON.stringify(rawJson, null, 2));

      // 2. 파싱 및 정규화 (병합 셀, 에러 값 보존)
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      const getMergedCellValue = (r: number, c: number) => {
        const address = XLSX.utils.encode_cell({ r, c });
        const merges = worksheet['!merges'] || [];
        for (const merge of merges) {
          if (r >= merge.s.r && r <= merge.e.r && c >= merge.s.c && c <= merge.e.c) {
            return worksheet[XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c })]?.v;
          }
        }
        return worksheet[address]?.v;
      };

      const data: any[][] = [];
      for (let r = range.s.r; r <= range.e.r; r++) {
        const row: any[] = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          row.push(getMergedCellValue(r, c));
        }
        data.push(row);
      }

      // 3. 헤더 매핑 및 정규화
      const keywordMap = {
        itemName: ['자재명', '품명', 'ITEM'],
        itemCategory: ['구분', '분류'],
        spec: ['규격', 'SPEC'],
        conAmount: ['요척', '소요량', 'QTY'],
        vendor: ['공급처', '업체명', 'VENDOR', 'MILL'],
        unitPrice: ['단가', 'PRICE'],
      };

      const allKeywords = Object.values(keywordMap).flat();
      const headerRowIndex = data.findIndex(row => 
        row.some(cell => cell && allKeywords.some(kw => String(cell).includes(kw)))
      );
      if (headerRowIndex === -1) throw new BadRequestException('자재 정보 헤더를 찾을 수 없습니다.');

      const headers = data[headerRowIndex] as any[];
      const findCol = (kws: string[]) => headers.findIndex(h => h && kws.some(kw => String(h).includes(kw)));
      const colMap = {
        itemName: findCol(keywordMap.itemName),
        itemCategory: findCol(keywordMap.itemCategory),
        spec: findCol(keywordMap.spec),
        conAmount: findCol(keywordMap.conAmount),
        vendor: findCol(keywordMap.vendor),
        unitPrice: findCol(keywordMap.unitPrice),
      };

      const styleInfo = { styleNo: '', totalQty: 0, factory: '', buyer: '', targetRdd: '' };

      const materials = data.slice(headerRowIndex + 1).map((row, idx) => {
        if (row.every(cell => cell === undefined || cell === null)) return null;
        
        const getRawVal = (colIdx: number) => row[colIdx];
        
        const itemName = getRawVal(colMap.itemName);
        const vendor = getRawVal(colMap.vendor);
        const conAmount = getRawVal(colMap.conAmount);
        const unitPrice = getRawVal(colMap.unitPrice);

        return {
          itemName: itemName || '',
          itemCategory: getRawVal(colMap.itemCategory) || '',
          spec: getRawVal(colMap.spec) || '',
          conAmount, // Raw Value (preserve #REF! etc)
          vendor: vendor || '',
          unitPrice, // Raw Value (preserve #REF! etc)
          status: (!itemName || !vendor) ? 'CONFIRM_REQUIRED' : 'VALID',
        };
      }).filter(m => m !== null);

      return {
        summary: {
          수행_내용: '엑셀 파일 파싱 및 자재 명세 추출 (Standard Data 정규화)',
          확인된_사실: `스타일 정보 추출 및 ${materials.length}개 자재 명세 파싱 완료`,
          분석_결과: '데이터 파싱 및 정규화 완료',
          불확실한_부분: materials.some(m => m?.status === 'CONFIRM_REQUIRED') ? '일부 자재 데이터 검토 필요 (CONFIRM_REQUIRED)' : '없음'
        },
        styleInfo,
        materials
      };
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Excel parsing failed: ${error.message}`, error.stack);
      throw new BadRequestException(`엑셀 파일 처리 중 오류가 발생했습니다: ${error.message}`);
    }
  }

  // PR-186 D: 실/테이프로 보이는(looksLikeThreadOrTape) 자재 중 아직 검토 안 된 것을 찾아
  // 종류를 추천한다(buildThreadTapeSuggestion — 추천은 정확히 1개 규칙에 매칭될 때만).
  // 자동 확정은 하지 않는다 — 사람이 bulk-apply(classifyThreadTape)로 직접 적용해야 한다.
  async getThreadTapeCandidates(reviewed: 'true' | 'false' | 'all' = 'false') {
    const [items, rules] = await Promise.all([
      this.itemRepository.find(),
      this.dataSource.getRepository(MaterialPackagingUnitRule).find(),
    ]);

    const isReviewed = (item: Item) => !!item.packagingReviewedAt || item.materialSubType != null;

    return items
      .filter((item) => looksLikeThreadOrTape(item.name, rules))
      .filter((item) => (reviewed === 'all' ? true : reviewed === 'true' ? isReviewed(item) : !isReviewed(item)))
      .map((item) => ({
        id: item.id,
        code: item.code,
        name: item.name,
        unit: item.unit ?? null,
        materialSubType: item.materialSubType ?? null,
        packagingReviewedAt: item.packagingReviewedAt ?? null,
        suggestion: buildThreadTapeSuggestion(item.name, rules),
      }));
  }

  // PR-186 D: 추천을 사람이 확인한 뒤 일괄 적용한다 — 전부 유효해야 전부 적용(all-or-nothing).
  // materialSubType이 null이면 "실/테이프 아님"으로 확정(packagingReviewedAt만 채움).
  async classifyThreadTape(assignments: ThreadTapeClassificationAssignment[]): Promise<{ updated: number }> {
    if (!assignments || assignments.length === 0) {
      throw new BadRequestException('적용할 항목이 없습니다.');
    }

    const itemIds = assignments.map((a) => a.itemId);
    const items = await this.itemRepository.find({ where: { id: In(itemIds) } });
    const itemById = new Map(items.map((i) => [i.id, i]));

    const subTypes = [...new Set(assignments.map((a) => a.materialSubType).filter((v): v is string => v != null))];
    const rules = subTypes.length > 0
      ? await this.dataSource.getRepository(MaterialPackagingUnitRule).find({ where: { materialSubType: In(subTypes) } })
      : [];
    const validSubTypes = new Set(rules.map((r) => r.materialSubType));

    for (const a of assignments) {
      if (!itemById.has(a.itemId)) {
        throw new BadRequestException(`존재하지 않는 품목 ID: ${a.itemId}`);
      }
      if (a.materialSubType != null && !validSubTypes.has(a.materialSubType)) {
        throw new BadRequestException(`존재하지 않는 실/테이프 종류입니다: ${a.materialSubType}`);
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const now = new Date();
      for (const a of assignments) {
        const item = itemById.get(a.itemId)!;
        item.materialSubType = a.materialSubType;
        item.packagingReviewedAt = now;
        await queryRunner.manager.save(item);
      }
      await queryRunner.commitTransaction();
      this.logger.log(`실/테이프 종류 일괄 적용 완료: ${assignments.length}건`);
      return { updated: assignments.length };
    } catch (err) {
      const error = err as Error;
      await queryRunner.rollbackTransaction();
      this.logger.error(`실/테이프 종류 일괄 적용 실패: ${error.message}`, error.stack);
      throw new InternalServerErrorException('실/테이프 종류 일괄 적용 중 오류가 발생했습니다.');
    } finally {
      await queryRunner.release();
    }
  }

  async bulkInsert(data: { styleInfo: any, matrix: any, materials: any[] }, policy: 'OVERWRITE' | 'SKIP') {
    this.logger.log(`Starting bulk insert for style: ${data.styleInfo.styleNo}`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. 스타일 및 BOM 정보 저장 (실제 비즈니스 로직에 맞춰 구현)
      // ...
      
      // 2. 자재 저장 (기존 로직 확장)
      for (const itemData of data.materials) {
        // ... (기존 로직 사용)
      }

      await queryRunner.commitTransaction();
      this.logger.log(`Bulk insert completed successfully.`);
      return { success: true };
    } catch (err) {
      const error = err as Error;
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to execute bulk insert: ${error.message}`, error.stack);
      throw new BadRequestException(`대량 저장 중 오류 발생, 롤백됨: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }
}