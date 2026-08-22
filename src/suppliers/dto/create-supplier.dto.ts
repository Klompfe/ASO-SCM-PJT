import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({ description: '공급업체 코드', example: 'SUP-001' })
  @IsNotEmpty({ message: '공급업체 코드는 필수입니다.' })
  @IsString()
  code: string;

  @ApiProperty({ description: '공급업체명', example: '(주) 글로벌 자재' })
  @IsNotEmpty({ message: '공급업체명은 필수입니다.' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: '사업자 등록 번호', example: '123-45-67890' })
  @IsOptional()
  @IsString()
  businessNumber?: string;

  @ApiPropertyOptional({ description: '연락처', example: '02-1234-5678' })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({ description: '이메일', example: 'contact@globalmat.com' })
  @IsOptional()
  @IsEmail({}, { message: '유효한 이메일 형식이 아닙니다.' })
  email?: string;

  @ApiPropertyOptional({ description: '주소', example: '서울시 강남구 테헤란로 123' })
  @IsOptional()
  @IsString()
  address?: string;
}
