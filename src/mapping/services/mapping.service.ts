import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MappingRule } from '../entities/mapping-rule.entity';
import { Item } from '../../items/entities/item.entity';
import { StandardDataMapper, StandardMaterial } from '../utils/standard-data-mapper.util';

export interface RawError {
  row: number;
  message: string;
}

@Injectable()
export class MappingService {
  constructor(
    @InjectRepository(MappingRule)
    private readonly ruleRepository: Repository<MappingRule>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
  ) {}

  async mapRawData(rawData: string[][]): Promise<{ data: StandardMaterial[]; rawErrors: RawError[] }> {
    const rawErrors: RawError[] = [];
    
    // 1. Transform via Utility (Shape Mapping)
    let mappedData = StandardDataMapper.parse(rawData);

    // 2. Lookup & Enrich (Business Mapping)
    const enrichedData = await Promise.all(mappedData.map(async (item, index) => {
      // Lookup existing item
      const itemEntity = await this.itemRepository.findOne({ where: { name: item.itemCategory } }); // Simplified lookup logic
      
      if (!itemEntity) {
        rawErrors.push({ row: index, message: `Item/Color not found: ${item.itemCategory}` });
        return { ...item, status: 'NEW_MASTER_CANDIDATE' };
      }

      return { ...item, status: 'MAPPED', itemId: itemEntity.id };
    }));

    return { data: enrichedData, rawErrors };
  }

  async saveMappingRule(rule: { rawKey: string; standardKey: string; ruleType: string }): Promise<MappingRule> {
    const newRule = this.ruleRepository.create({
      ...rule,
      targetEntityId: 0 // Placeholder
    });
    return await this.ruleRepository.save(newRule);
  }
}
