import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class FindMidoPriceCandidatesDto {
  @ApiProperty({ example: "겉감 WOOL" })
  @IsNotEmpty()
  @IsString()
  materialName: string;

  // PR-182: INVOICE 라인의 단위(예: "CONE", "롤") — 단가표 후보 단위가 M이고 이 값이
  // 콘/롤 표기면 콘/롤단가로 환산한 후보를 함께 내려준다. 없으면(또는 M 등 그 외
  // 단위면) 환산하지 않는다(기존 동작과 동일).
  @ApiPropertyOptional({ description: 'INVOICE 라인 단위(콘/롤 환산 여부 판단용)', example: 'CONE' })
  @IsOptional()
  @IsString()
  lineUnit?: string;

  // PR-182: 라인의 실/테이프 종류(BomItem.threadType/tapeType과 동일한 문자열, 예:
  // 'COA_SA'). 있으면 그 종류 하나로만 환산(determined). 없으면(미지정) 가능한 종류별
  // 환산값을 전부 후보로 나열하고 자동 확정하지 않는다(안전모드).
  @ApiPropertyOptional({ description: '라인의 실/테이프 종류(미지정이면 생략)', example: 'COA_SA' })
  @IsOptional()
  @IsString()
  materialSubType?: string;
}
