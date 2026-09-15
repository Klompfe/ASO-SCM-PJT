import { PartialType } from '@nestjs/swagger';
import { CreateSupplierDto } from './create-supplier.dto';

// PR-088: code는 CreateSupplierDto에 애초에 없으므로 PartialType으로 만들어도 이
// DTO에는 code가 포함되지 않는다 — 등록 후 코드는 불변(업무상 식별자로 쓰이므로
// 수정 API로도 임의 변경할 수 없게 하려는 의도된 설계다, Buyer/PR-085와 동일).
export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}
