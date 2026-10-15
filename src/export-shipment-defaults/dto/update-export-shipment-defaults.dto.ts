import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateExportShipmentDefaultsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shipperInfo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  consigneeInfo?: string;

  @ApiPropertyOptional({ example: 'INCHEON, KOREA' })
  @IsOptional()
  @IsString()
  portOfLoading?: string;

  @ApiPropertyOptional({ example: 'HAIPHONG, VIETNAM' })
  @IsOptional()
  @IsString()
  finalDestination?: string;

  // PR-193: Carrier(선박/운송사/항차)는 선적 건마다 바뀌는 값이라 더 이상 기본값으로
  // 저장하지 않는다 — 구버전 화면이 여전히 이 필드를 보내도 400이 나지 않도록 DTO
  // 자체는 남겨두되, deprecated로 표시하고 서비스가 저장 시 조용히 무시한다.
  @ApiPropertyOptional({ example: 'DONGJIN CONTINENTAL / 0217W', deprecated: true, description: 'PR-193: 더 이상 기본값으로 저장되지 않음(건별 헤더에서만 입력)' })
  @IsOptional()
  @IsString()
  carrier?: string;
}
