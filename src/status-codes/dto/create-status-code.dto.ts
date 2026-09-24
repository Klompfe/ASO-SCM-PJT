import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreateStatusCodeDto {
  @ApiProperty({ description: '어느 모듈의 상태값인지(예: WORK_ORDER)', example: 'WORK_ORDER' })
  @IsString()
  @IsNotEmpty()
  domain: string;

  // 실제 데이터(예: WorkOrder.status)에 그대로 저장되는 값이라 코드 쪽이 기대하는
  // 형태(영문 대문자 + 언더스코어, 기존 enum 값과 같은 스타일)로 강제한다.
  @ApiProperty({ description: '상태 코드 값(영문 대문자로 시작, 대문자/숫자/언더스코어)', example: 'ON_HOLD' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z][A-Z0-9_]*$/, { message: 'code는 영문 대문자로 시작하고 대문자/숫자/언더스코어만 쓸 수 있습니다.' })
  code: string;

  @ApiProperty({ description: '화면 표시용 라벨', example: '보류' })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiPropertyOptional({ description: '정렬 순서(작을수록 먼저 표시)', default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ description: '활성 여부(기본 true)', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
