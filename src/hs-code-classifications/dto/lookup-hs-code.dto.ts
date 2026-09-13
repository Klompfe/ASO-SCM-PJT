import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

// 외부(Python 수입통관 이메일 에이전트) 조회용 — (itemType, fabricType, composition)
// 정확히 일치하는 1건만 반환한다(검색/부분일치 아님, 목록 필터 DTO와 분리한 이유).
export class LookupHsCodeDto {
  @ApiProperty({ example: "WOMEN'S JACKET" })
  @IsNotEmpty()
  @IsString()
  itemType: string;

  @ApiProperty({ example: '직물' })
  @IsNotEmpty()
  @IsString()
  fabricType: string;

  @ApiProperty({ example: 'WOOL 98%, POLYURETHANE 2%' })
  @IsNotEmpty()
  @IsString()
  composition: string;
}
