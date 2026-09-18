import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNotEmpty, IsNumber, IsPositive, IsString, ValidateNested } from 'class-validator';

export class CreateImportShipmentPackingDetailRowDto {
  @ApiProperty({ example: '4' })
  @IsNotEmpty()
  @IsString()
  color: string;

  @ApiProperty({ example: 'L' })
  @IsNotEmpty()
  @IsString()
  size: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @IsPositive()
  qty: number;
}

// 화면에서 여러 색상/사이즈 줄을 한 번에 입력해 등록하는 흐름(PR-107) — 엑셀
// 없이도 바로 여러 건을 등록할 수 있어야 한다는 요구사항에 맞춘 벌크 생성.
export class CreateImportShipmentPackingDetailsDto {
  @ApiProperty({ type: [CreateImportShipmentPackingDetailRowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateImportShipmentPackingDetailRowDto)
  details: CreateImportShipmentPackingDetailRowDto[];
}
