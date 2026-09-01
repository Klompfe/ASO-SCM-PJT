import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { StandardMaterial } from '../interfaces/standard-material.interface';

export interface ValidationError {
  row: number;
  message: string;
}

@Injectable()
export class MappingValidationPipe implements PipeTransform {
  transform(value: StandardMaterial[]): { data: StandardMaterial[]; errors: ValidationError[] } {
    const errors: ValidationError[] = [];

    value.forEach((item, index) => {
      // Fallback validation
      const styleNo = item.styleNo || item.code;
      const category = item.itemCategory || item.itemName;
      const quantity = item.quantity ?? item.orderQty ?? 0;

      if (!styleNo) errors.push({ row: index, message: 'Style No (or code) is missing' });
      if (!category) errors.push({ row: index, message: 'Item Category (or name) is missing' });
      if (quantity <= 0) errors.push({ row: index, message: 'Quantity (or orderQty) must be greater than 0' });
    });

    return { data: value, errors };
  }
}
