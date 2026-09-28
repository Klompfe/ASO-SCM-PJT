import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { PackingMaterialCategory } from '../entities/packing-receipt.entity';

// multipart/form-data로 파일과 함께 전달되는 나머지 필드 — materialCategory에 따라
// 업로드된 엑셀에서 어떤 양식(원단 롤 / 부자재 카톤)의 헤더를 찾을지 결정한다.
export class UploadPackingReceiptDto {
  @ApiProperty({ enum: PackingMaterialCategory })
  @IsEnum(PackingMaterialCategory)
  materialCategory: PackingMaterialCategory;

  @ApiPropertyOptional({ example: '2026-09-15' })
  @IsOptional()
  @IsDateString()
  receivedDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  // PR-157: multipart/form-data라 문자열로 전달되므로 명시적으로 숫자로 변환한다.
  @ApiPropertyOptional({ example: 12.5, description: '공급업체 제공 CBM(수동 입력)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cbm?: number;
}
