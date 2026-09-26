import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserRole } from './entities/user.entity';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { AuditLog } from '../audit-log/audit-log.decorator';

// PR-070: 공개 가입 경로는 /auth/register(@Public())로 별도 유지되므로, 이 컨트롤러의
// 사용자 관리 엔드포인트(생성 포함)는 전부 ADMIN/MASTER 전용으로 제한한다 — 지금까지는
// RBAC 가드가 전혀 걸려 있지 않아 인증만 되면 누구나 다른 사용자 목록/정보를 조회하거나
// role을 바꿀 수 있는 상태였다.
// PR-153: "모든 권한 변경은 마스터 사용자의 승인으로 진행"을 소프트웨어로 강제하기 위해,
// PATCH :id 요청 본문에 role 필드가 있으면 ADMIN은 막고 MASTER만 허용한다(클래스 레벨
// @Roles(ADMIN, MASTER)로는 필드 단위 구분이 안 돼 update()에서 별도 체크). 이 변경은
// AuditLog로 자동 기록되므로 별도 승인 큐는 만들지 않는다(감사 로그 = 승인 기록으로 충분
// 하다는 판단, 제시님 확인 완료) — 화면상의 승인 대기 워크플로는 이번 범위 밖.
@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MASTER)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @AuditLog({ entityType: 'User' })
  @ApiOperation({ summary: '신규 사용자 생성', description: '새로운 사용자를 등록합니다.' })
  @ApiResponse({ status: 201, description: '성공적으로 생성됨', type: User })
  @ApiResponse({ status: 400, description: '잘못된 입력 값 (Validation 에러)' })
  @ApiResponse({ status: 409, description: '이메일 중복' })
  async create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return await this.usersService.create(createUserDto);
  }

  @Get()
  @ApiOperation({ summary: '전체 사용자 목록 조회', description: '모든 사용자 리스트를 최신순으로 조회합니다.' })
  @ApiResponse({ status: 200, description: '조회 성공', type: [User] })
  async findAll(): Promise<User[]> {
    return await this.usersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: '단일 사용자 조회', description: 'ID를 기준으로 특정 사용자를 조회합니다.' })
  @ApiParam({ name: 'id', description: '사용자 PK ID', example: 1 })
  @ApiResponse({ status: 200, description: '조회 성공', type: User })
  @ApiResponse({ status: 404, description: '사용자를 찾을 수 없음' })
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<User> {
    return await this.usersService.findOne(id);
  }

  @Patch(':id')
  @AuditLog({ entityType: 'User', table: 'users', pkColumn: 'id' })
  @ApiOperation({ summary: '사용자 정보 수정', description: '특정 사용자의 이메일, 이름, 역할(role), 활성화 상태를 수정합니다.' })
  @ApiParam({ name: 'id', description: '사용자 PK ID', example: 1 })
  @ApiResponse({ status: 200, description: '수정 성공', type: User })
  @ApiResponse({ status: 404, description: '사용자를 찾을 수 없음' })
  @ApiResponse({ status: 409, description: '이메일 중복' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
    @GetUser() user: any,
  ): Promise<User> {
    if (updateUserDto.role !== undefined && user.role !== UserRole.MASTER) {
      throw new ForbiddenException('사용자 역할(role) 변경은 마스터 사용자만 할 수 있습니다.');
    }
    return await this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @AuditLog({ entityType: 'User', table: 'users', pkColumn: 'id' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '사용자 삭제', description: 'ID를 기준으로 특정 사용자를 삭제합니다.' })
  @ApiParam({ name: 'id', description: '사용자 PK ID', example: 1 })
  @ApiResponse({ status: 200, description: '삭제 성공' })
  @ApiResponse({ status: 404, description: '사용자를 찾을 수 없음' })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<{ message: string }> {
    return await this.usersService.remove(id);
  }
}