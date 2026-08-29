import { Injectable } from '@nestjs/common';

@Injectable()
export class BusinessRuleService {
  /**
   * BOM 계산: 소요량 = 생산수량 * 단위소요량
   * 실제 DB에는 결과값만 저장하거나, 계산식을 저장하여 동적 계산 가능
   */
  calculateRequiredQty(productionQty: number, consumptionPerUnit: number): number {
    return productionQty * consumptionPerUnit;
  }
}
