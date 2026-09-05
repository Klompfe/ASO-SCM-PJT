import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { MasterStyle } from '../../styles/entities/master-style.entity';
import { StyleOverview, StyleOverviewStatus } from '../../styles/entities/style-overview.entity';
import { Bom } from '../../boms/entities/bom.entity';
import { BomItem } from '../../boms/entities/bom-item.entity';
import { ImportFile, ImportStatus } from '../../imports/entities/import-file.entity';
import { Item, ItemType } from '../../items/entities/item.entity';
import { CommitMappingDto } from '../dto/commit-mapping.dto';

@Injectable()
export class MappingCommitService {
  constructor(
    private readonly dataSource: DataSource,
  ) {}

  async commit(payload: CommitMappingDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { styleNo, overviewData, bomItems } = payload;

      // 1. Import Log
      await queryRunner.manager.save(ImportFile, {
        fileName: `${styleNo}.csv`,
        styleNo,
        status: ImportStatus.SUCCESS,
      });

      // 2 & 3. MasterStyle & Overview
      let style = await queryRunner.manager.findOne(MasterStyle, { where: { styleNo }, relations: ['overview'] });
      if (!style) {
        style = queryRunner.manager.create(MasterStyle, { styleNo });
      }

      const overview = queryRunner.manager.create(StyleOverview, {
        factory: overviewData.factory,
        totalQty: overviewData.totalQty,
        buyer: overviewData.buyer,
        firstShipDate: overviewData.shipDate ? new Date(overviewData.shipDate) : null,
        status: StyleOverviewStatus.PENDING_APPROVAL,
        style,
      });
      style.overview = overview;
      await queryRunner.manager.save(style);

      // 4. BOMs & Items
      const bom = queryRunner.manager.create(Bom, {
        bomNo: `BOM-${styleNo}-001`,
        version: 'V1',
        style
      });
      await queryRunner.manager.save(bom);

      for (const item of bomItems) {
        // 5. Register Material if not exists
        let material = await queryRunner.manager.findOne(Item, { where: { name: item.itemName } });
        if (!material) {
          material = await queryRunner.manager.save(Item, {
            code: `MAT-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
            name: item.itemName,
            type: ItemType.RAW_MATERIAL,
            unit: 'EA'
          });
        }

        await queryRunner.manager.save(BomItem, {
          bom,
          material,
          category: item.category || 'GENERAL',
          colorCode: item.colorCode || 'N/A',
          spec: item.spec || 'N/A',
          consumption: item.consumption ?? 0,
          requiredQty: item.requiredQty ?? 0,
          supplier: item.supplier || 'N/A',
          unitPrice: item.unitPrice ?? 0,
          remarks: item.remarks || 'N/A'
        });
      }

      await queryRunner.commitTransaction();
      return { success: true, styleNo };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException(err);
    } finally {
      await queryRunner.release();
    }
  }
}
