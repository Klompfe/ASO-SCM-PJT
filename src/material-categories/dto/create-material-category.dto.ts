import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateMaterialCategoryDto {
  @ApiProperty({ description: '품목군 이름(고유)', example: '실' })
  @IsNotEmpty({ message: '품목군 이름은 필수입니다.' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: '정렬 순서(작을수록 앞)', example: 4 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ description: '활성 여부(비활성은 선택 목록에서 숨김)', example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
