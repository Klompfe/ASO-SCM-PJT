import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item } from './entities/item.entity';
import { Bom } from './entities/bom.entity';
import { CreateBomDto } from './dto/create-bom.dto';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    @InjectRepository(Bom)
    private readonly bomRepository: Repository<Bom>,
  ) {}

  async findAll() {
    return await this.itemRepository.find();
  }

  async create(createItemDto: any) {
    const existing = await this.itemRepository.findOne({
      where: { code: createItemDto.code },
    });

    if (existing) {
      throw new ConflictException(
        `이미 존재 품목 코드입니다. (ID: ${existing.id}, Code: ${existing.code})`,
      );
    }

    const item = this.itemRepository.create(createItemDto);
    return await this.itemRepository.save(item);
  }

  async createBom(createBomDto: CreateBomDto) {
    const parentId = +createBomDto.parentItemId;
    const childId = +createBomDto.childItemId;

    const parentItem = await this.itemRepository.findOne({
      where: { id: parentId },
    });
    const childItem = await this.itemRepository.findOne({
      where: { id: childId },
    });

    if (!parentItem || !childItem) {
      throw new NotFoundException('모품목 또는 자품목을 찾을 수 없습니다.');
    }

    const bom = this.bomRepository.create({
      parentItem,
      childItem,
      quantity: createBomDto.quantity,
    });

    return await this.bomRepository.save(bom);
  }

  async getBom(parentItemId: string | number) {
    return await this.bomRepository.find({
      where: { parentItem: { id: +parentItemId } },
      relations: ['childItem'],
    });
  }
}