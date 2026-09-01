import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { MasterStyle } from '../../styles/entities/master-style.entity';
import { StyleOverview } from '../../styles/entities/style-overview.entity';
import { Bom } from '../../boms/entities/bom.entity';
import { BomItem } from '../../boms/entities/bom-item.entity';
import { ImportFile, ImportStatus } from '../../imports/entities/import-file.entity';
import { Item, ItemType } from '../../items/entities/item.entity';

@Injectable()
export class MappingCommitService {
  constructor(
    private readonly dataSource: DataSource,
  ) {}

  async commit(payload: any) {
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
        ...overviewData,
        style
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
          materialId: (material.id as unknown) as number,
          category: item.category || 'GENERAL',
          colorCode: item.colorCode || 'N/A',
          spec: item.spec || 'N/A',
          consumption: parseFloat(item.consumption) || 0,
          requiredQty: parseFloat(item.requiredQty) || 0,
          supplier: item.supplier || 'N/A',
          unitPrice: parseFloat(item.unitPrice) || 0,
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
