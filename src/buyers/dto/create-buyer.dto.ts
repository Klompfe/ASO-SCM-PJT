import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// PR-085: code는 더 이상 클라이언트가 넘기지 않는다 — 서버가 "TY-{브랜드약칭}-
// {YY}{일련번호4자리}"(예: TY-MB-260001) 형식으로 자동채번한다(BuyersService.create()
// 참고). 고객사명만 입력해도 등록되도록 담당자/연락처/국가를 선택으로 완화했다.
export class CreateBuyerDto {
  @ApiProperty({ description: '고객사명', example: '(주) 미도컴퍼니' })
  @IsNotEmpty({ message: '고객사명은 필수입니다.' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: '담당자', example: '김철수' })
  @IsOptional()
  @IsString()
  contactPerson?: string;

  @ApiPropertyOptional({ description: '연락처', example: '02-1234-5678' })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({ description: '이메일', example: 'contact@buyer.com' })
  @IsOptional()
  @IsEmail({}, { message: '유효한 이메일 형식이 아닙니다.' })
  email?: string;

  @ApiPropertyOptional({ description: '국가', example: 'USA' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: '주소', example: '123 Main St, New York' })
  @IsOptional()
  @IsString()
  address?: string;

  // PR-085: 비워두면 고객사명(name)에서 알파벳만 추출해 자동 결정한다(BuyersService
  // 참고) — 브랜드/고객약칭.
  @ApiPropertyOptional({ description: '브랜드/고객약칭(선택, 비우면 고객사명에서 자동생성)', example: 'MB' })
  @IsOptional()
  @IsString()
  brandCode?: string;
}
