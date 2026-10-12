import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

// PR-188: 미리보기에서 사람이 확인(체크)한 행만 보낸다 — 서버가 다시 검증한다
// (itemName 재중복 확인·숫자 범위 등, preview와 같은 규칙). all-or-nothing이라 이 중
// 하나라도 서버 재검증에서 걸리면 전체 400.
export class ImportMidoPriceApplyRowDto {
  @ApiProperty({ description: 'CSV 안에서의 행 번호(보고용)' })
  @IsInt()
  line: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  itemName: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  priceUsdMin: number;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  priceUsdMax: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  unit: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  note?: string | null;

  // NEW(신규)/CHANGED(기존 값과 다름) 중 무엇으로 적용할지 — preview가 준 분류를
  // 그대로 돌려받아 로그/응답 집계(created/updated)에 쓴다. SAME/ERROR 행은 애초에
  // 체크 대상이 아니므로 이 값으로 들어오면 서버가 거절한다(선택 잘못 — 400).
  @ApiProperty({ enum: ['NEW', 'CHANGED'] })
  @IsIn(['NEW', 'CHANGED'])
  status: 'NEW' | 'CHANGED';
}

export class ImportMidoPriceApplyDto {
  @ApiProperty({ type: [ImportMidoPriceApplyRowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ImportMidoPriceApplyRowDto)
  rows: ImportMidoPriceApplyRowDto[];
}
