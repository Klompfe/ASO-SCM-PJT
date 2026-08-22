import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Inventory } from './entities/inventory.entity';

@Injectable()
export class InventoriesService {
  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<Inventory[]> {
    return await this.inventoryRepository.find({
      relations: ['item'],
      order: { id: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Inventory> {
    const inventory = await this.inventoryRepository.findOne({
      where: { id },
      relations: ['item'],
    });
    if (!inventory) {
      throw new NotFoundException(`ID가 ${id}인 재고 항목을 찾을 수 없습니다.`);
    }
    return inventory;
  }

  // 입고 처리 (Stock In) - 트랜잭션 적용
  async stockIn(id: number, quantity: number): Promise<Inventory> {
    if (quantity <= 0) {
      throw new BadRequestException('입고 수량은 0보다 커야 합니다.');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const inventory = await queryRunner.manager.findOne(Inventory, {
        where: { id },
        lock: { mode: 'pessimistic_write' }, // 동시성 제어를 위한 비관적 락
      });

      if (!inventory) {
        throw new NotFoundException(`ID가 ${id}인 재고 항목을 찾을 수 없습니다.`);
      }

      inventory.quantity += quantity;
      const updated = await queryRunner.manager.save(inventory);

      await queryRunner.commitTransaction();
      return updated;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // 출고 처리 (Stock Out) - 트랜잭션 및 재고 부족 검증
  async stockOut(id: number, quantity: number): Promise<Inventory> {
    if (quantity <= 0) {
      throw new BadRequestException('출고 수량은 0보다 커야 합니다.');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const inventory = await queryRunner.manager.findOne(Inventory, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!inventory) {
        throw new NotFoundException(`ID가 ${id}인 재고 항목을 찾을 수 없습니다.`);
      }

      if (inventory.quantity < quantity) {
        throw new BadRequestException(
          `재고가 부족합니다. 현재 재고: ${inventory.quantity}, 요청 수량: ${quantity}`,
        );
      }

      inventory.quantity -= quantity;
      const updated = await queryRunner.manager.save(inventory);

      await queryRunner.commitTransaction();
      return updated;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}