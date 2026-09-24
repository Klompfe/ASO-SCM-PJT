import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
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

  // 프론트(BuyersManager.tsx)가 폼 초기값을 email: ''로 두고 그대로 보내므로,
  // 빈 문자열은 @IsOptional()이 건너뛰지 않는다(값이 undefined/null일 때만 건너뜀) —
  // @IsEmail()에 도달하기 전에 ''를 null로 바꿔 "선택 입력"이 실제로 선택이 되게 한다.
  // undefined가 아니라 null로 바꾸는 이유: UpdateBuyerDto(PartialType)에서 이 필드가
  // update()의 Object.assign(entity, dto)로 그대로 병합되는데, undefined면 "필드를
  // 안 보냄(기존 값 유지)"과 구분이 안 돼 이메일을 지우고 저장하는 PATCH가 조용히
  // 무시된다 — null은 "명시적으로 비움"으로 남아 실제로 지워진다.
  @ApiPropertyOptional({ description: '이메일', example: 'contact@buyer.com' })
  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @IsEmail({}, { message: '유효한 이메일 형식이 아닙니다.' })
  email?: string | null;

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
