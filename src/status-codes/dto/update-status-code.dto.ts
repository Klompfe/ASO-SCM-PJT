import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// domain/code는 수정 대상에서 뺀다 — 이미 실제 데이터(예: WorkOrder.status)가 그 값을 참조하고
// 있을 수 있어, 값 자체를 바꾸면 기존 데이터가 가리키는 상태코드가 조용히 사라지는 셈이 된다.
// 값을 더 이상 쓰지 않게 하려면 isActive=false로 비활성화하고, 새 코드가 필요하면 새로 등록한다.
export class UpdateStatusCodeDto {
  @ApiPropertyOptional({ description: '화면 표시용 라벨' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  label?: string;

  @ApiPropertyOptional({ description: '정렬 순서(작을수록 먼저 표시)' })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ description: '활성 여부' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
