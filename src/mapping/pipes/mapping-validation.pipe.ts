import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { StandardMaterial } from '../utils/standard-data-mapper.util';

export interface ValidationError {
  row: number;
  message: string;
}

@Injectable()
export class MappingValidationPipe implements PipeTransform {
  transform(value: StandardMaterial[]): { data: StandardMaterial[]; errors: ValidationError[] } {
    const errors: ValidationError[] = [];

    value.forEach((item, index) => {
      if (!item.styleNo) errors.push({ row: index, message: 'Style No is missing' });
      if (!item.itemCategory) errors.push({ row: index, message: 'Color/Category is missing' });
      if (item.quantity <= 0) errors.push({ row: index, message: 'Quantity must be greater than 0' });
    });

    return { data: value, errors };
  }
}
