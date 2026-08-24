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
import * as XLSX from 'xlsx';

export interface CreateItemInput {
  code: string;
  name: string;
  type: ItemType | string;
  unit?: string;
  spec?: string;
  description?: string;
}

export interface UpdateItemInput {
  code?: string;
  name?: string;
  type?: ItemType | string;
  unit?: string;
  spec?: string;
  description?: string;
}

@Injectable()
export class ItemsService {
  private readonly logger = new Logger(ItemsService.name);

  constructor(
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateItemInput): Promise<Item> {
    this.logger.log(`Creating new item with code: ${dto.code}`);

    if (!dto.code || !dto.name || !dto.type) {
      throw new BadRequestException('품목 코드, 이름, 타입은 필수 입력 항목입니다.');
    }

    const existingItem = await this.itemRepository.findOne({
      where: { code: dto.code },
    });

    if (existingItem) {
      throw new ConflictException(`이미 존재하는 품목 코드입니다: ${dto.code}`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const newItem = new Item();
      newItem.code = dto.code;
      newItem.name = dto.name;
      newItem.type = dto.type as ItemType;
      newItem.unit = dto.unit || 'EA';
      if (dto.spec) newItem.spec = dto.spec;
      if (dto.description) newItem.description = dto.description;

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

    if (filter?.type) {
      queryBuilder.andWhere('item.type = :type', { type: filter.type });
    }

    if (filter?.keyword) {
      queryBuilder.andWhere(
        '(item.name LIKE :keyword OR item.code LIKE :keyword)',
        { keyword: `%${filter.keyword}%` },
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

    if (dto.code) item.code = dto.code;
    if (dto.name) item.name = dto.name;
    if (dto.type) item.type = dto.type as ItemType;
    if (dto.unit) item.unit = dto.unit;
    if (dto.spec !== undefined) item.spec = dto.spec;
    if (dto.description !== undefined) item.description = dto.description;

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
      if (!sheetName) {
        throw new BadRequestException('엑셀 파일에 시트가 존재하지 않습니다.');
      }

      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<any>(worksheet);

      if (rows.length === 0) {
        throw new BadRequestException('엑셀 파일에 데이터 행이 존재하지 않습니다.');
      }

      const parseItemType = (rawType: string): { type?: ItemType; error?: string } => {
        if (!rawType) {
          return { error: '품목구분은 필수 항목입니다.' };
        }
        const clean = rawType.toUpperCase().replace(/\s+/g, '');
        if (clean === 'RAW_MATERIAL' || clean === '원자재') {
          return { type: ItemType.RAW_MATERIAL };
        }
        if (clean === 'SEMI_FINISHED' || clean === '반제품') {
          return { type: ItemType.SEMI_FINISHED };
        }
        if (clean === 'FINISHED_GOOD' || clean === '완제품') {
          return { type: ItemType.FINISHED_GOOD };
        }
        return { error: `유효하지 않은 품목구분: ${rawType} (원자재, 반제품, 완제품 중 하나여야 합니다.)` };
      };

      const mappedRows = rows.map((row, index) => {
        const codeKey = Object.keys(row).find(k => k.trim() === '품목코드' || k.trim().toLowerCase() === 'code');
        const nameKey = Object.keys(row).find(k => k.trim() === '품목명' || k.trim().toLowerCase() === 'name');
        const typeKey = Object.keys(row).find(k => k.trim() === '품목구분' || k.trim() === '품목유형' || k.trim().toLowerCase() === 'type');
        const specKey = Object.keys(row).find(k => k.trim() === '규격' || k.trim().toLowerCase() === 'spec');
        const unitKey = Object.keys(row).find(k => k.trim() === '단위' || k.trim().toLowerCase() === 'unit');
        const qtyKey = Object.keys(row).find(k => k.trim() === '수량' || k.trim().toLowerCase() === 'quantity' || k.trim().toLowerCase() === 'qty');
        const descKey = Object.keys(row).find(k => k.trim() === '설명' || k.trim().toLowerCase() === 'description');

        const code = codeKey && row[codeKey] !== undefined ? String(row[codeKey]).trim() : '';
        const name = nameKey && row[nameKey] !== undefined ? String(row[nameKey]).trim() : '';
        const rawType = typeKey && row[typeKey] !== undefined ? String(row[typeKey]).trim() : '';
        const spec = specKey && row[specKey] !== undefined ? String(row[specKey]).trim() : undefined;
        const unit = unitKey && row[unitKey] !== undefined ? String(row[unitKey]).trim() : undefined;
        const quantity = qtyKey && row[qtyKey] !== undefined && row[qtyKey] !== null ? Number(row[qtyKey]) : undefined;
        const description = descKey && row[descKey] !== undefined ? String(row[descKey]).trim() : undefined;

        return {
          rowIndex: index + 2, // Excel headers on row 1, data starts at row 2
          code,
          name,
          rawType,
          spec,
          unit,
          quantity,
          description,
        };
      });

      const codes = mappedRows.map(r => r.code).filter(c => !!c);
      const existingItems = codes.length > 0 ? await this.itemRepository.find({
        where: { code: In(codes) },
      }) : [];
      const existingCodesSet = new Set(existingItems.map(item => item.code));

      const validatedRows = [];
      for (const mapped of mappedRows) {
        const errors: string[] = [];

        if (!mapped.code) {
          errors.push('품목코드는 필수 항목입니다.');
        }
        if (!mapped.name) {
          errors.push('품목명은 필수 항목입니다.');
        }

        let finalType: ItemType | undefined;
        if (mapped.rawType) {
          const { type, error } = parseItemType(mapped.rawType);
          if (error) {
            errors.push(error);
          } else {
            finalType = type;
          }
        } else {
          errors.push('품목구분은 필수 항목입니다.');
        }

        if (mapped.quantity !== undefined && isNaN(mapped.quantity)) {
          errors.push('수량은 숫자 형식이어야 합니다.');
        }

        const isDuplicate = existingCodesSet.has(mapped.code);
        const isValid = errors.length === 0;

        validatedRows.push({
          rowIndex: mapped.rowIndex,
          code: mapped.code,
          name: mapped.name,
          type: finalType,
          rawType: mapped.rawType,
          spec: mapped.spec,
          unit: mapped.unit,
          quantity: mapped.quantity,
          description: mapped.description,
          isDuplicate,
          isValid,
          errors,
        });
      }

      return {
        summary: {
          totalRows: validatedRows.length,
          validRowsCount: validatedRows.filter(r => r.isValid).length,
          invalidRowsCount: validatedRows.filter(r => !r.isValid).length,
        },
        rows: validatedRows,
      };

    } catch (err) {
      const error = err as Error;
      this.logger.error(`Excel parsing failed: ${error.message}`, error.stack);
      throw new BadRequestException(`엑셀 파일 처리 중 오류가 발생했습니다: ${error.message}`);
    }
  }

  async bulkInsert(items: any[], policy: 'OVERWRITE' | 'SKIP') {
    this.logger.log(`Starting bulk insert of ${items.length} items with policy: ${policy}`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let successCount = 0;
    let skippedCount = 0;
    let overwrittenCount = 0;

    try {
      for (const itemData of items) {
        if (!itemData.code || !itemData.name || !itemData.type) {
          throw new BadRequestException('일부 품목에 필수 입력 항목(코드, 이름, 타입)이 누락되었습니다.');
        }

        const existingItem = await queryRunner.manager.findOne(Item, {
          where: { code: itemData.code },
        });

        if (existingItem) {
          if (policy === 'SKIP') {
            skippedCount++;
            continue;
          } else if (policy === 'OVERWRITE') {
            existingItem.name = itemData.name;
            existingItem.type = itemData.type as ItemType;
            if (itemData.unit !== undefined) existingItem.unit = itemData.unit;
            if (itemData.spec !== undefined) existingItem.spec = itemData.spec;
            if (itemData.description !== undefined) existingItem.description = itemData.description;

            await queryRunner.manager.save(existingItem);
            overwrittenCount++;
          }
        } else {
          const newItem = new Item();
          newItem.code = itemData.code;
          newItem.name = itemData.name;
          newItem.type = itemData.type as ItemType;
          newItem.unit = itemData.unit || 'EA';
          newItem.spec = itemData.spec || null;
          newItem.description = itemData.description || null;

          await queryRunner.manager.save(newItem);
          successCount++;
        }
      }

      await queryRunner.commitTransaction();
      this.logger.log(`Bulk insert completed successfully. Success: ${successCount}, Overwritten: ${overwrittenCount}, Skipped: ${skippedCount}`);
      return {
        successCount,
        skippedCount,
        overwrittenCount,
      };
    } catch (err) {
      const error = err as Error;
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to execute bulk insert: ${error.message}`, error.stack);
      throw new BadRequestException(`대량 품목 저장 중 오류가 발생하여 모든 변경사항이 롤백되었습니다: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }
}