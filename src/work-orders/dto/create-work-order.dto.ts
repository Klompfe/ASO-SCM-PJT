import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class CreateWorkOrderDto {
  @ApiProperty({ description: '품목 ID', example: 1 })
  @IsInt()
  itemId: number;

  @ApiProperty({ description: '목표 생산 수량', example: 10 })
  @IsInt()
  @Min(1)
  targetQuantity: number;
}