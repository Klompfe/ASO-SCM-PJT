import { IsString, IsEmail, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    example: 'test@example.com',
    description: '사용자 이메일',
    required: true,
  })
  @IsEmail({}, { message: '유효한 이메일 형식을 입력하세요.' })
  @IsNotEmpty({ message: '이메일은 필수 입력값입니다.' })
  email: string;

  @ApiProperty({
    example: '홍길동',
    description: '사용자 이름',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: '이름은 필수 입력값입니다.' })
  name: string;

  @ApiProperty({
    example: 'password123!',
    description: '비밀번호',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: '비밀번호는 필수 입력값입니다.' })
  @MinLength(8, { message: '비밀번호는 최소 8자 이상이어야 합니다.' })
  password: string;
}
