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
import { GetItemsFilterDto } from './dto/get-items-filter.dto';
import { BulkInsertDto } from './dto/bulk-insert-items.dto';

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
    @Body() updateItemDto: any,
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

  @ApiOperation({ summary: '모든 품목 데이터 초기화' })
  @ApiResponse({ status: 200, description: '초기화 성공' })
  @Delete('clear/all')
  async clearAll() {
    return await this.itemsService.clearAll();
  }
  }