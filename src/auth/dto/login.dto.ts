import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: 'user1',
    description: '사용자 아이디 (username)',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'username 필드는 필수 입력값입니다.' })
  username: string;

  @ApiProperty({
    example: 'password123!',
    description: '비밀번호',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'password 필드는 필수 입력값입니다.' })
  password: string;
}