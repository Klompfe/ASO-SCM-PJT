import { PartialType } from '@nestjs/swagger';
import { CreateBuyerDto } from './create-buyer.dto';

// PR-085: code는 CreateBuyerDto에 애초에 없으므로 PartialType으로 만들어도 이 DTO에는
// code가 포함되지 않는다 — 등록 후 코드는 불변(업무상 식별자로 쓰이므로 수정 API로도
// 임의 변경할 수 없게 하려는 의도된 설계다).
export class UpdateBuyerDto extends PartialType(CreateBuyerDto) {}
