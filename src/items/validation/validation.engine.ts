import { Injectable } from '@nestjs/common';
import { StandardMaterialDto } from '../dto/standard-material.dto';

export interface ValidationErrorLog {
  originalData: any;
  normalizedData: StandardMaterialDto;
  errorCause: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationErrorLog[];
}

@Injectable()
export class ValidationEngine {
  validate(raw: any, normalized: StandardMaterialDto): ValidationResult {
    const errors: ValidationErrorLog[] = [];

    // 1. 필수 값 누락 검증
    if (!normalized.itemName) errors.push(this.createLog(raw, normalized, 'Missing itemName'));
    if (!normalized.vendor) errors.push(this.createLog(raw, normalized, 'Missing vendor'));

    // 2. 계산식 검증 (Production Qty * Consumption = Required Qty)
    // 원본 데이터에 관련 필드가 있다고 가정
    const prodQty = Number(raw.productionQty || 0);
    const consumption = Number(raw.consumption || 0);
    const reqQty = Number(raw.requiredQty || 0);

    if (prodQty * consumption !== reqQty) {
      errors.push(
        this.createLog(
          raw,
          normalized,
          `Calculation mismatch: ${prodQty} * ${consumption} != ${reqQty}`,
        ),
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  private createLog(original: any, normalized: StandardMaterialDto, cause: string): ValidationErrorLog {
    return {
      originalData: original,
      normalizedData: normalized,
      errorCause: cause,
    };
  }
}
