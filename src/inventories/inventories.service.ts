import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inventory } from './entities/inventory.entity';
import { Item } from '../items/entities/item.entity';

@Injectable()
export class InventoriesService {
  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
  ) {}

  async getByItemId(itemId: number) {
    return await this.inventoryRepository.find({
      where: { item: { id: Number(itemId) } },
      relations: ['item'],
    });
  }

  async findByItem(itemId: number) {
    return await this.inventoryRepository.findOne({
      where: { item: { id: Number(itemId) } },
    });
  }

  async findOneByItemId(itemId: number) {
    const item = await this.itemRepository.findOne({
      where: { id: Number(itemId) },
    });
    if (!item) {
      throw new NotFoundException(`ID가 ${itemId}인 품목을 찾을 수 없습니다.`);
    }
    return item;
  }

  async findAll() {
    return await this.inventoryRepository.find({ relations: ['item'] });
  }
}