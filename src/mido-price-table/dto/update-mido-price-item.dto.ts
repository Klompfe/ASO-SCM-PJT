import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateMidoPriceItemDto } from './create-mido-price-item.dto';

export class UpdateMidoPriceItemDto extends PartialType(CreateMidoPriceItemDto) {
  // PR-188: 삭제 대신 사용 중지/재사용 토글(사람이 직접, 자동 중지 없음).
  @ApiPropertyOptional({ description: '사용 중지하려면 false' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
