import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { POHeaderEntity } from './entities/po-header.entity';
import { POHistoryEntity } from './entities/po-history.entity';
import { POController } from './po.controller';
import { POService } from './po.service';
import { POStateEngineService } from './po-state-engine.service';
import { AiClientModule } from '../ai-client/ai-client.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([POHeaderEntity, POHistoryEntity]),
    AiClientModule,
  ],
  controllers: [POController],
  providers: [POService, POStateEngineService],
  exports: [POService, POStateEngineService],
})
export class POModule {}