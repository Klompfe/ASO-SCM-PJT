import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsPositive } from 'class-validator';

export class CreateWorkOrderDto {
  @ApiProperty({ description: '품목 ID (Item ID)', example: 1 })
  @IsNotEmpty({ message: 'itemId는 필수 입력 항목입니다.' })
  @IsNumber({}, { message: 'itemId는 숫자 형태여야 합니다.' })
  itemId: number;

  @ApiProperty({ description: '지시 수량', example: 10 })
  @IsNotEmpty({ message: 'quantity는 필수 입력 항목입니다.' })
  @IsNumber({}, { message: 'quantity는 숫자 형태여야 합니다.' })
  @IsPositive({ message: 'quantity는 0보다 큰 양수여야 합니다.' })
  quantity: number;
}