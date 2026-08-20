import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from '../items/entities/item.entity';
import { Inventory } from '../inventories/entities/inventory.entity';
import { WorkOrder } from '../work-orders/entities/work-order.entity';
import { User } from '../users/entities/user.entity';
import { SeedService } from './seed.service';

@Module({
  imports: [
    // 1. DatabaseModule 내부 및 외부 서비스에서 사용할 모든 핵심 엔티티 Repository 등록
    TypeOrmModule.forFeature([
      Item,
      Inventory,
      WorkOrder,
      User,
    ]),
  ],
  providers: [
    // 2. DB 초기화 및 시딩 전담 프로바이더 등록
    SeedService,
  ],
  exports: [
    // 3. 다른 모듈(Service)에서도 TypeORM Repository와 SeedService를 주입받을 수 있도록 내보내기
    TypeOrmModule,
    SeedService,
  ],
})
export class DatabaseModule implements OnModuleInit {
  private readonly logger = new Logger(DatabaseModule.name);

  /**
   * DatabaseModule이 초기화될 때 연결 상태 검증 및 모듈 로딩 로그 출력
   */
  onModuleInit() {
    this.logger.log('📦 DatabaseModule이 성공적으로 초기화되었습니다. (엔티티 및 Repository 로딩 완료)');
  }
}