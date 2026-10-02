import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Length, ValidateIf } from 'class-validator';

export class CreateBrandPrefixRuleDto {
  // isNumericStart가 true면 prefix는 없어야 하고(숫자시작 규칙), false/미지정이면
  // prefix가 반드시 있어야 한다 — 서비스 레이어가 아니라 여기서 바로 막아 모호한
  // 규칙(둘 다 없음/둘 다 있음)이 저장되지 않게 한다.
  @ApiPropertyOptional({ description: '2자리 접두사(숫자시작 규칙이면 생략)', example: 'BF' })
  @ValidateIf((o) => !o.isNumericStart)
  @IsNotEmpty({ message: 'isNumericStart가 아니면 prefix는 필수입니다.' })
  @IsString()
  @Length(2, 2, { message: 'prefix는 2자리여야 합니다.' })
  prefix?: string;

  @ApiPropertyOptional({ description: '숫자로 시작하는 스타일번호 규칙 여부', example: false, default: false })
  @IsOptional()
  @IsBoolean()
  isNumericStart?: boolean;

  // PR-165: 숫자시작 규칙이 둘 이상(에잇세컨즈/뮤트)일 때, 더 구체적인 쪽을 구분하는
  // 정규식 문자열. isNumericStart=false면 의미 없으므로 비워둔다.
  @ApiPropertyOptional({ description: '숫자시작 규칙 중 더 구체적인 패턴(정규식 문자열, 비우면 catch-all)', example: '^\\d{2}[FS]' })
  @IsOptional()
  @IsString()
  numericPattern?: string;

  @ApiProperty({ description: '브랜드명', example: '빈폴' })
  @IsNotEmpty()
  @IsString()
  brandName: string;

  @ApiPropertyOptional({ description: '비고(자유입력)', example: 'W컨셉 다른 라인' })
  @IsOptional()
  @IsString()
  note?: string;
}
