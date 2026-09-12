import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
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
}
