import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HsCodeClassification } from './entities/hs-code-classification.entity';
import { StyleHsCodeMapping } from './entities/style-hs-code-mapping.entity';
import { HsCodeClassificationsService } from './hs-code-classifications.service';
import { HsCodeClassificationsController } from './hs-code-classifications.controller';
import { HsCodeApiKeyGuard } from './guards/hs-code-api-key.guard';

@Module({
  imports: [TypeOrmModule.forFeature([HsCodeClassification, StyleHsCodeMapping])],
  controllers: [HsCodeClassificationsController],
  providers: [HsCodeClassificationsService, HsCodeApiKeyGuard],
  exports: [HsCodeClassificationsService],
})
export class HsCodeClassificationsModule {}
