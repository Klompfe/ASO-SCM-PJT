import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductionContract } from './entities/production-contract.entity';
import { ProductionContractsService } from './production-contracts.service';
import { ProductionContractsController } from './production-contracts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ProductionContract])],
  controllers: [ProductionContractsController],
  providers: [ProductionContractsService],
  exports: [ProductionContractsService],
})
export class ProductionContractsModule {}
