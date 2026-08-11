import { IsNotEmpty, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBomDto {
  @ApiProperty({ description: '모품목 ID', example: 1 })
  @IsNotEmpty({ message: '모품목 ID는 필수입니다.' })
  @IsNumber({}, { message: '모품목 ID는 숫자형이어야 합니다.' })
  parentItemId: number;

  @ApiProperty({ description: '자품목 ID', example: 2 })
  @IsNotEmpty({ message: '자품목 ID는 필수입니다.' })
  @IsNumber({}, { message: '자품목 ID는 숫자형이어야 합니다.' })
  childItemId: number;

  @ApiProperty({ description: '소요량', example: 3 })
  @IsNotEmpty({ message: '소요량은 필수입니다.' })
  @IsNumber({}, { message: '소요량은 숫자형이어야 합니다.' })
  quantity: number;
}