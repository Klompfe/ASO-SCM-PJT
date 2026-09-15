import { PartialType } from '@nestjs/swagger';
import { CreateProductionContractDto } from './create-production-contract.dto';

// PR-093: priceSource/cmtPrice 조합 검증은 생성 시점에만 강제한다(요구사항 범위).
// 수정 시 이 조합을 깨뜨리는 것은 이번 PR의 관심사가 아니므로 별도 재검증은 하지 않는다.
export class UpdateProductionContractDto extends PartialType(CreateProductionContractDto) {}
