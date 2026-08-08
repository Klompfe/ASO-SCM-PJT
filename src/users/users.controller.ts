import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
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
  @ApiOperation({ summary: '사용자 정보 수정', description: '특정 사용자의 이메일 또는 이름을 수정합니다.' })
  @ApiParam({ name: 'id', description: '사용자 PK ID', example: 1 })
  @ApiResponse({ status: 200, description: '수정 성공', type: User })
  @ApiResponse({ status: 404, description: '사용자를 찾을 수 없음' })
  @ApiResponse({ status: 409, description: '이메일 중복' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<User> {
    return await this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '사용자 삭제', description: 'ID를 기준으로 특정 사용자를 삭제합니다.' })
  @ApiParam({ name: 'id', description: '사용자 PK ID', example: 1 })
  @ApiResponse({ status: 200, description: '삭제 성공' })
  @ApiResponse({ status: 404, description: '사용자를 찾을 수 없음' })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<{ message: string }> {
    return await this.usersService.remove(id);
  }
}