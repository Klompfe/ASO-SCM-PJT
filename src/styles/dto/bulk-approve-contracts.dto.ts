import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional } from 'class-validator';

export class BulkApproveContractsDto {
  // 지정하면 그 계약 id들만 대상으로 하고, 생략하면 현재 PENDING_APPROVAL 전체를 대상으로 한다.
  @ApiPropertyOptional({ example: [1, 2, 3], description: '대상 계약 id 목록. 생략 시 승인대기 전체.' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  ids?: number[];
}
