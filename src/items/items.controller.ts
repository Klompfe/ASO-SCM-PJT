import 'multer';
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  UseInterceptors,
  UseGuards,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ItemsService } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { GetItemsFilterDto } from './dto/get-items-filter.dto';
import { BulkInsertDto } from './dto/bulk-insert-items.dto';
import { ClassifyThreadTapeDto } from './dto/classify-thread-tape.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('품목 관리 API (Items)')
@ApiBearerAuth()
@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @ApiOperation({ summary: '신규 품목 등록' })
  @ApiResponse({ status: 201, description: '품목 생성 성공' })
  @ApiResponse({ status: 400, description: '잘못된 요청 데이터' })
  @ApiResponse({ status: 401, description: '인증 실패' })
  @Post()
  async create(@Body() createItemDto: CreateItemDto) {
    return await this.itemsService.create(createItemDto);
  }

  @ApiOperation({ summary: '품목 목록 조회 (페이징 & 검색)' })
  @ApiResponse({ status: 200, description: '목록 조회 성공' })
  @Get()
  async findAll(@Query() filter: GetItemsFilterDto) {
    return await this.itemsService.findAll(filter);
  }

  @ApiOperation({ summary: '엑셀 파일 업로드 미리보기' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '데이터 검증 결과 반환' })
  @Post('upload-preview')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPreview(@UploadedFile() file: Express.Multer.File) {
    return await this.itemsService.uploadPreview(file);
  }

  @ApiOperation({ summary: '검증된 품목 대량 등록' })
  @ApiResponse({ status: 201, description: '대량 저장 성공' })
  @Post('bulk-insert')
  async bulkInsert(@Body() bulkInsertDto: any) {
    return await this.itemsService.bulkInsert(bulkInsertDto.data, bulkInsertDto.policy);
  }

  // PR-186 D: ':id' 라우트보다 먼저 선언해야 한다(안 그러면 'thread-tape-candidates'가
  // ParseIntPipe에 걸려 ":id" 핸들러로 잘못 매칭된다).
  @ApiOperation({ summary: '실/테이프로 보이는 자재 중 종류 미지정(또는 all/true) 목록과 추천값' })
  @ApiResponse({ status: 200, description: '조회 성공' })
  @Get('thread-tape-candidates')
  async getThreadTapeCandidates(@Query('reviewed') reviewed?: 'true' | 'false' | 'all') {
    return await this.itemsService.getThreadTapeCandidates(reviewed);
  }

  // PR-186-FIX: 소요량·발주 수량·INVOICE 환산에 직접 영향을 주는 확정 작업이라
  // MANAGER/ADMIN만 허용한다(안전모드 원칙). 조회(thread-tape-candidates)는 바꾸지 않는다.
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: '실/테이프 종류 일괄 지정(전부 유효해야 전부 적용, MANAGER/ADMIN)' })
  @ApiResponse({ status: 200, description: '적용 성공' })
  @ApiResponse({ status: 400, description: '존재하지 않는 품목 ID/종류, 또는 잘못된 형식' })
  @ApiResponse({ status: 403, description: 'MANAGER/ADMIN 권한 필요' })
  @Post('thread-tape-classification')
  async classifyThreadTape(@Body() body: ClassifyThreadTapeDto) {
    return await this.itemsService.classifyThreadTape(body.assignments);
  }

  @ApiOperation({ summary: '특정 품목 상세 조회' })
  @ApiResponse({ status: 200, description: '조회 성공' })
  @ApiResponse({ status: 404, description: '품목을 찾을 수 없음' })
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.itemsService.findOne(id);
  }

  @ApiOperation({ summary: '품목 정보 수정' })
  @ApiResponse({ status: 200, description: '수정 성공' })
  @ApiResponse({ status: 404, description: '품목을 찾을 수 없음' })
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateItemDto: UpdateItemDto,
  ) {
    return await this.itemsService.update(id, updateItemDto);
  }

  @ApiOperation({ summary: '품목 삭제' })
  @ApiResponse({ status: 200, description: '삭제 성공' })
  @ApiResponse({ status: 404, description: '품목을 찾을 수 없음' })
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return await this.itemsService.remove(id);
  }
}