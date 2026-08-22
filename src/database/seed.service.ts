import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Item, ItemType } from '../items/entities/item.entity';
import { Inventory } from '../inventories/entities/inventory.entity';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * NestJS 애플리케이션 시작 완료 시 자동 실행
   */
  async onApplicationBootstrap() {
    try {
      await this.seedData();
    } catch (error) {
      const err = error as Error;
      this.logger.error('❌ Data Seeding 중 에러 발생:', err.stack);
    }
  }

  /**
   * DB 기초 품목 및 초기 재고 시딩 로직 (트랜잭션 및 enum 타입 적용)
   */
  async seedData() {
    const itemCount = await this.itemRepository.count();

    if (itemCount > 0) {
      this.logger.log('ℹ️ 이미 기초 품목 데이터가 존재하므로 Seeding을 건너끕니다.');
      return;
    }

    this.logger.log('🌱 초기 기초 품목(Item) 및 재고 데이터 Seeding 시작...');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. 원자재 생성 (원사 B) - ItemType Enum 적용
      const rawItem = queryRunner.manager.create(Item, {
        code: 'RAW-001',
        name: '원사 B',
        type: ItemType?.RAW_MATERIAL || ('RAW_MATERIAL' as any),
      });
      const savedRawItem = await queryRunner.manager.save(rawItem);

      // 2. 완제품 생성 (직물 A) - ItemType Enum 적용
      const prodItem = queryRunner.manager.create(Item, {
        code: 'PROD-001',
        name: '직물 A',
        type: ItemType?.FINISHED_GOOD || ('FINISHED_GOOD' as any),
      });
      const savedProdItem = await queryRunner.manager.save(prodItem);

      // 3. 원자재 초기 재고 10개 등록
      const initialInventory = queryRunner.manager.create(Inventory, {
        item: savedRawItem,
        quantity: 10,
        location: 'MAIN_WAREHOUSE',
      });
      await queryRunner.manager.save(initialInventory);

      // 트랜잭션 커밋
      await queryRunner.commitTransaction();

      this.logger.log(
        `✅ 기초 데이터 Seeding 완료!\n` +
          `   - 원자재: ${savedRawItem.name} (ID: ${savedRawItem.id}, 초기 재고: 10개)\n` +
          `   - 완제품: ${savedProdItem.name} (ID: ${savedProdItem.id})`,
      );
    } catch (err) {
      const error = err as Error;
      await queryRunner.rollbackTransaction();
      this.logger.error('❌ Seeding 트랜잭션 실패로 롤백되었습니다.', error.message);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}