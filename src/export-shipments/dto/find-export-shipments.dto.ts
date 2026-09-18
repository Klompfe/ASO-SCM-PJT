import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

// PR-102: 셋 다 선택적이고 부분일치이며 AND로 결합된다. styleNo/materialName은
// ExportShipmentLine을 통해 조인해서 판별한다(한 선적서류에 여러 라인/스타일이
// 섞여 있을 수 있으므로 "라인 중 하나라도 두 조건을 함께 만족하면" 그 선적서류를
// 포함 — export-shipments.service.ts의 findAll() 참고).
export class FindExportShipmentsDto {
  @ApiPropertyOptional({ description: '스타일번호 부분일치(라인 기준)', example: 'MB62SLM103Z' })
  @IsOptional()
  @IsString()
  styleNo?: string;

  @ApiPropertyOptional({ description: '자재명 부분일치(라인의 description 기준)', example: 'WOOL' })
  @IsOptional()
  @IsString()
  materialName?: string;

  @ApiPropertyOptional({ description: '선적서류 문서번호(sheetNo) 부분일치', example: 'TY-260704K' })
  @IsOptional()
  @IsString()
  sheetNo?: string;
}
