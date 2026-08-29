import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item } from '../../items/entities/item.entity';
import { Style } from '../../master/entities/master.entities';
import { ExceptionCode } from '../entities/exception-log.entity';

export interface ValidResult {
  isValid: boolean;
  errors: { row: number; message: string; stage: string; code: ExceptionCode }[];
}

@Injectable()
export class ValidationService {
  constructor(
    @InjectRepository(Item) private itemRepo: Repository<Item>,
    @InjectRepository(Style) private styleRepo: Repository<Style>,
  ) {}

  async validate(data: any[]): Promise<ValidResult> {
    const errors: { row: number; message: string; stage: string; code: ExceptionCode }[] = [];

    for (let index = 0; index < data.length; index++) {
      const item = data[index];
      
      this.validateSchema(item, index, errors);
      await this.validateMaster(item, index, errors);
      this.validateBusiness(item, index, errors);
      this.validateCalculation(item, index, errors);
      this.validateConsistency(item, index, errors);
    }

    return { isValid: errors.length === 0, errors };
  }

  private validateSchema(item: any, row: number, errors: any[]) {
    if (item.quantity === undefined || typeof item.quantity !== 'number') {
      errors.push({ row, message: 'Invalid quantity type', stage: 'Schema', code: ExceptionCode.INVALID_QUANTITY });
    }
  }

  private async validateMaster(item: any, row: number, errors: any[]) {
    const style = await this.styleRepo.findOne({ where: { styleNo: item.styleNo } });
    if (!style) {
      errors.push({ row, message: 'Style not found', stage: 'Master', code: ExceptionCode.MASTER_NOT_FOUND });
    }
  }

  private validateBusiness(item: any, row: number, errors: any[]) {
    if (!item.styleNo || !item.itemCategory) {
      errors.push({ row, message: 'StyleNo or Category missing', stage: 'Business', code: ExceptionCode.MISSING_REQUIRED_FIELD });
    }
  }

  private validateCalculation(item: any, row: number, errors: any[]) {
    if (item.quantity <= 0) {
      errors.push({ row, message: 'Quantity must be positive', stage: 'Calculation', code: ExceptionCode.INVALID_QUANTITY });
    }
  }

  private validateConsistency(item: any, row: number, errors: any[]) {
    if (item.size === '55' && item.quantity > 1000) {
      // Logic for consistency checks
    }
  }
}
