import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item } from './entities/item.entity';
import { Bom } from './entities/bom.entity';
import { CreateItemDto } from './dto/create-item.dto';
import { CreateBomDto } from './dto/create-bom.dto';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    @InjectRepository(Bom)
    private readonly bomRepository: Repository<Bom>,
  ) {}

  // 1. 품목 생성
  async createItem(createItemDto: CreateItemDto): Promise<Item> {
    const existing = await this.itemRepository.findOne({
      where: { code: createItemDto.code },
    });
    if (existing) {
      throw new BadRequestException(`이미 존재하는 품목 코드입니다: ${createItemDto.code}`);
    }
    const item = this.itemRepository.create(createItemDto);
    return await this.itemRepository.save(item);
  }

  // 2. 전체 품목 조회
  async findAllItems(): Promise<Item[]> {
    return await this.itemRepository.find();
  }

  // 3. 단일 품목 조회 (BOM 관계 포함)
  async findItemById(id: string): Promise<Item> {
    const item = await this.itemRepository.findOne({
      where: { id },
      relations: ['parentBoms', 'parentBoms.childItem'],
    });
    if (!item) {
      throw new NotFoundException(`ID가 ${id}인 품목을 찾을 수 없습니다.`);
    }
    return item;
  }

  // 4. BOM 구조 등록 (상위 품목 - 하위 자재 연결)
  async createBom(createBomDto: CreateBomDto): Promise<Bom> {
    const { parentItemId, childItemId, quantity } = createBomDto;

    if (parentItemId === childItemId) {
      throw new BadRequestException('상위 품목과 하위 자재는 같을 수 없습니다.');
    }

    const parentItem = await this.itemRepository.findOne({ where: { id: parentItemId } });
    const childItem = await this.itemRepository.findOne({ where: { id: childItemId } });

    if (!parentItem || !childItem) {
      throw new NotFoundException('지정된 상위 품목 또는 하위 자재를 찾을 수 없습니다.');
    }

    const bom = this.bomRepository.create({
      parentItem,
      childItem,
      quantity,
    });

    return await this.bomRepository.save(bom);
  }

  // 5. 특정 제품의 BOM(하위 자재 명세서) 조회
  async getBomByParentId(parentItemId: string): Promise<Bom[]> {
    return await this.bomRepository.find({
      where: { parentItem: { id: parentItemId } },
      relations: ['childItem'],
    });
  }
}