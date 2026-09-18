import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

// PR-102: 셋 다 선택적이고 부분일치이며 AND로 결합된다. ImportShipment는 export와
// 달리 styleNo가 헤더 자체에 있어(한 문서=한 스타일) 조인이 필요 없고, materialName은
// ImportShipmentLine.itemType(품목) 기준으로 라인을 조인해서 판별한다. sheetNo는
// ImportShipment.invoiceNo(베트남에서 발행하는 INVOICE 번호)에 대응한다.
export class FindImportShipmentsDto {
  @ApiPropertyOptional({ description: '스타일번호 부분일치(헤더 기준)', example: 'MB62SLM103Z' })
  @IsOptional()
  @IsString()
  styleNo?: string;

  @ApiPropertyOptional({ description: '품목/자재명 부분일치(라인의 itemType 기준)', example: '원단' })
  @IsOptional()
  @IsString()
  materialName?: string;

  @ApiPropertyOptional({ description: 'INVOICE 번호(invoiceNo) 부분일치', example: 'TYVN2026-26' })
  @IsOptional()
  @IsString()
  sheetNo?: string;
}
