import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { CreateUserDto } from './create-user.dto';
import { UserRole } from '../entities/user.entity';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  // PR-070: 관리자(MANAGER/ADMIN)가 사용자 관리 화면에서 다른 사용자의 역할을
  // 바꾸거나 계정을 비활성화할 수 있어야 한다 — CreateUserDto에는 없는 필드라
  // 여기 별도로 추가한다.
  @ApiProperty({ enum: UserRole, required: false, description: '사용자 역할' })
  @IsOptional()
  @IsEnum(UserRole, { message: '유효한 role 값이 아닙니다.' })
  role?: UserRole;

  @ApiProperty({ required: false, description: '계정 활성화 여부' })
  @IsOptional()
  @IsBoolean({ message: 'isActive는 boolean이어야 합니다.' })
  isActive?: boolean;
}
