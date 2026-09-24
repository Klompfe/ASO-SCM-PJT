import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GetStatusCodesFilterDto {
  @ApiProperty({ description: '조회할 도메인(예: WORK_ORDER)', example: 'WORK_ORDER' })
  @IsString()
  @IsNotEmpty()
  domain: string;

  // 필터 드롭다운(일반 화면)은 기본값(활성만)을 쓰고, 상태코드 관리 화면(관리자)만 true로
  // 비활성 코드도 함께 조회해 재활성화할 수 있게 한다.
  @ApiPropertyOptional({ description: 'true면 비활성 상태코드도 포함(기본은 활성만)', example: 'true' })
  @IsOptional()
  @IsBooleanString()
  includeInactive?: string;
}
