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

  // 품목별 재고 조회 (없으면 기본값 0으로 생성)
  async getByItemId(itemId: string): Promise<Inventory> {
    let inventory = await this.inventoryRepository.findOne({
      where: { item: { id: itemId } },
      relations: ['item'],
    });

    if (!inventory) {
      const item = await this.itemRepository.findOne({ where: { id: itemId } });
      if (!item) {
        throw new NotFoundException(`ID가 ${itemId}인 품목을 찾을 수 없습니다.`);
      }
      inventory = this.inventoryRepository.create({ item, quantity: 0 });
      await this.inventoryRepository.save(inventory);
    }

    return inventory;
  }

  // 전체 재고 목록 조회
  async findAll(): Promise<Inventory[]> {
    return await this.inventoryRepository.find({ relations: ['item'] });
  }
}