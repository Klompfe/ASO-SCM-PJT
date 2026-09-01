import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MappingRule } from './entities/mapping-rule.entity';
import { StagingParseRaw } from './entities/staging-parse-raw.entity';
import { Item } from '../items/entities/item.entity';
import { MasterStyle } from '../styles/entities/master-style.entity';
import { StyleOverview } from '../styles/entities/style-overview.entity';
import { Bom } from '../boms/entities/bom.entity';
import { BomItem } from '../boms/entities/bom-item.entity';
import { ImportFile } from '../imports/entities/import-file.entity';
import { MappingService } from './services/mapping.service';
import { MappingCommitService } from './services/mapping-commit.service';
import { ValidationService } from './services/validation.service';
import { MappingController } from './mapping.controller';
import { MappingCommitController } from './controllers/mapping-commit.controller';
import { ItemsModule } from '../items/items.module';

@Module({
  imports: [TypeOrmModule.forFeature([
      MappingRule, StagingParseRaw, Item, MasterStyle, StyleOverview, Bom, BomItem, ImportFile
    ]), ItemsModule],
  controllers: [MappingController, MappingCommitController],
  providers: [MappingService, MappingCommitService, ValidationService],
  exports: [MappingService, MappingCommitService, ValidationService],
})
export class MappingModule {}
