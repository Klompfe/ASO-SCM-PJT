import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StandardMaterialDto } from '../dto/standard-material.dto';
import { Item } from '../../items/entities/item.entity';
import { Style } from '../../styles/entities/style.entity';
import { Bom } from '../../boms/entities/bom.entity';

@Injectable()
export class StandardDataProcessingService {
  private readonly logger = new Logger(StandardDataProcessingService.name);

  constructor(private readonly dataSource: DataSource) {}

  async processValidatedData(dtos: StandardMaterialDto[], styleId: number): Promise<void> {
    const validData = dtos.filter((d) => d.status === 'VALID');
    if (validData.length === 0) return;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const style = await queryRunner.manager.findOneBy(Style, { styleNo: String(styleId) });
      if (!style) throw new Error(`Style not found: ${styleId}`);

      for (const dto of validData) {
        // Master DB: Material (Item)
        let material = await queryRunner.manager.findOneBy(Item, { name: dto.itemName });
        if (!material) {
          material = queryRunner.manager.create(Item, {
            name: dto.itemName,
            type: dto.itemCategory as any,
            spec: dto.spec,
          });
          material = await queryRunner.manager.save(material);
        }

        // BOM Transaction DB
        const bom = queryRunner.manager.create(Bom, {
          style: style as any,
          items: [{ materialId: material.id, category: dto.itemCategory, consumption: Number(dto.conAmount) || 0, requiredQty: 0, colorCode: 'N/A', spec: dto.spec, supplier: 'N/A', unitPrice: 0, remarks: 'N/A' }] as any,
        });
        await queryRunner.manager.save(bom);
      }

      await queryRunner.commitTransaction();
      this.logger.log(`Successfully processed ${validData.length} items.`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to process validated data', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
