import { IsString, IsNotEmpty, IsEmail, IsOptional, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty({ message: '사용자명(username)은 필수 입력 항목입니다.' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: '비밀번호(password)는 필수 입력 항목입니다.' })
  @MinLength(6, { message: '비밀번호는 최소 6자 이상이어야 합니다.' })
  password: string;

  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  name?: string;
}