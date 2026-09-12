import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

// 발주(들)에서 파생할 수 없는 물류 헤더 정보 — generate 호출 시 알고 있으면 함께
// 넣고, 모르면 비워뒀다가 이후 화면에서 채운다(이번 PR은 값 자체보다 라인 자동생성이
// 핵심이라 헤더 수정 API는 범위 밖 — 필요하면 별도 PR로 추가).
export class GenerateExportShipmentDto {
  @ApiPropertyOptional({ example: 'TY-260704K' })
  @IsOptional()
  @IsString()
  sheetNo?: string;

  @ApiPropertyOptional({ example: '2026-09-15' })
  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

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

  @ApiPropertyOptional({ example: 'DONGJIN CONTINENTAL / 0217W' })
  @IsOptional()
  @IsString()
  carrier?: string;

  @ApiPropertyOptional({ example: '2026-09-20' })
  @IsOptional()
  @IsDateString()
  sailingDate?: string;
}
