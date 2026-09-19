import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class SetActiveBomDto {
  @ApiProperty({ description: '이 스타일에서 앞으로 사용할(활성) BOM의 id', example: 116 })
  @IsInt()
  @Min(1)
  bomId: number;
}
