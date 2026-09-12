import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateBuyerDto {
  @ApiProperty({ description: '고객사 코드', example: 'BUY-001' })
  @IsNotEmpty({ message: '고객사 코드는 필수입니다.' })
  @IsString()
  code: string;

  @ApiProperty({ description: '고객사명', example: '(주) 미도컴퍼니' })
  @IsNotEmpty({ message: '고객사명은 필수입니다.' })
  @IsString()
  name: string;

  @ApiProperty({ description: '담당자', example: '김철수' })
  @IsNotEmpty({ message: '담당자는 필수입니다.' })
  @IsString()
  contactPerson: string;

  @ApiProperty({ description: '연락처', example: '02-1234-5678' })
  @IsNotEmpty({ message: '연락처는 필수입니다.' })
  @IsString()
  contactPhone: string;

  @ApiPropertyOptional({ description: '이메일', example: 'contact@buyer.com' })
  @IsOptional()
  @IsEmail({}, { message: '유효한 이메일 형식이 아닙니다.' })
  email?: string;

  @ApiProperty({ description: '국가', example: 'USA' })
  @IsNotEmpty({ message: '국가는 필수입니다.' })
  @IsString()
  country: string;

  @ApiPropertyOptional({ description: '주소', example: '123 Main St, New York' })
  @IsOptional()
  @IsString()
  address?: string;
}
