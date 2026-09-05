import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MasterStyle } from './entities/master-style.entity';
import { StyleOverview } from './entities/style-overview.entity';
import { Contract } from './entities/contract.entity';
import { StylesService } from './styles.service';
import { StylesController } from './styles.controller';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MasterStyle, StyleOverview, Contract])],
  controllers: [StylesController, ContractsController],
  providers: [StylesService, ContractsService],
})
export class StylesModule {}
