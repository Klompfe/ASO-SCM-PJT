import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Item, ItemType } from './entities/item.entity';

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

export interface ItemQueryFilter {
  page?: number;
  limit?: number;
  type?: string;
  keyword?: string;
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

  async findAll(filter?: ItemQueryFilter) {
    const page = Math.max(1, Number(filter?.page) || 1);
    const limit = Math.max(1, Number(filter?.limit) || 10);
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
}