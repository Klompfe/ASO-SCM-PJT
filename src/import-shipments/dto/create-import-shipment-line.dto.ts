import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

// hsCode는 요청에 받지 않는다 — (itemType, fabricType, composition)으로 서버가
// PR-081 HsCodeClassification을 자동조회해 채운다(3절). 사용자가 직접 입력하는
// 경로는 PUT /import-shipments/:id/lines/:lineId 뿐이다.
export class CreateImportShipmentLineDto {
  @ApiProperty({ example: "WOMEN'S JACKET" })
  @IsNotEmpty()
  @IsString()
  itemType: string;

  // PR-083.1: Vietnam INVOICE 업로드로 만들어지는 라인 중 HS코드 마스터에 아직
  // 없는 신규 스타일은 혼용률을 구할 방법이 없어 null일 수 있다(수동 입력 폼은
  // 프론트에서 여전히 필수로 받으므로 여기 optional 완화가 그 화면의 UX에는
  // 영향을 주지 않는다).
  @ApiPropertyOptional({ example: 'WOOL 98%, POLYURETHANE 2%' })
  @IsOptional()
  @IsString()
  composition?: string;

  @ApiPropertyOptional({ example: '직물', default: '직물' })
  @IsOptional()
  @IsString()
  fabricType?: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  qty: number;

  @ApiProperty({ example: 'EA' })
  @IsNotEmpty()
  @IsString()
  unit: string;

  @ApiPropertyOptional({ example: 3.5 })
  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @ApiPropertyOptional({ example: 350 })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  netWeight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  grossWeight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  packageCount?: number;
}
