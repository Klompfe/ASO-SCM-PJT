import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item } from './entities/item.entity';
import { CreateItemDto } from './dto/create-item.dto';
import { CreateBomDto } from './dto/create-bom.dto';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
  ) {}

  // 신규 품목 생성
  async create(createItemDto: CreateItemDto): Promise<Item> {
    const item = this.itemRepository.create(createItemDto);
    return await this.itemRepository.save(item);
  }

  // 전체 품목 목록 조회
  async findAll(): Promise<Item[]> {
    return await this.itemRepository.find();
  }

  // 단일 품목 조회
  async findOne(id: number): Promise<Item> {
    const item = await this.itemRepository.findOne({
      where: { id },
    });
    if (!item) {
      throw new NotFoundException(`ID가 ${id}인 품목을 찾을 수 없습니다.`);
    }
    return item;
  }

  // BOM 등록
  async createBom(createBomDto: CreateBomDto) {
    return {
      message: 'BOM이 성공적으로 등록되었습니다.',
      data: createBomDto,
    };
  }

  // BOM 조회
  async getBom(id: number) {
    const item = await this.findOne(id);
    return {
      parentItem: item,
      components: [],
    };
  }
}