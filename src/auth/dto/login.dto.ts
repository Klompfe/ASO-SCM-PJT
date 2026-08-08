import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com', description: '로그인 이메일' })
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  @IsNotEmpty({ message: '이메일을 입력해 주세요.' })
  email: string;

  @ApiProperty({ example: 'password123!', description: '로그인 비밀번호' })
  @IsString()
  @IsNotEmpty({ message: '비밀번호를 입력해 주세요.' })
  password: string;
}