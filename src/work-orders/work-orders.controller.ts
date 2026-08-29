import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  UseGuards,
  Query,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  FileTypeValidator,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { WorkOrdersService } from './work-orders.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderStatusDto } from './dto/update-work-order-status.dto';
import { WorkOrder } from './entities/work-order.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetWorkOrdersFilterDto } from './dto/get-work-orders-filter.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('Work Orders (작업 지시 관리)')
@ApiBearerAuth()
@Controller('work-orders')
@UseGuards(JwtAuthGuard)
export class WorkOrdersController {
  constructor(private readonly woService: WorkOrdersService) {}

  @Post('upload-image')
  @ApiOperation({ summary: '작업지시서 이미지 분석' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new FileTypeValidator({ fileType: '.(png|jpeg|jpg|pdf)' })],
      }),
    )
    file: Express.Multer.File,
  ) {
    return await this.woService.analyzeWorkOrderImage(file);
  }

  @Post()
  @ApiOperation({ summary: '작업 지시 생성' })
  @ApiResponse({ status: 201, type: WorkOrder })
  create(@Body() dto: CreateWorkOrderDto): Promise<WorkOrder> {
    return this.woService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '작업 지시 전체 목록 조회 (페이징 & 필터)' })
  @ApiResponse({ status: 200 })
  findAll(@Query() filter: GetWorkOrdersFilterDto) {
    return this.woService.findAll(filter);
  }

  @Get(':id')
  @ApiOperation({ summary: '작업 지시 상세 조회' })
  @ApiResponse({ status: 200, type: WorkOrder })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<WorkOrder> {
    return this.woService.findOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '작업 지시 상태 변경' })
  @ApiResponse({ status: 200, type: WorkOrder })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWorkOrderStatusDto,
  ): Promise<WorkOrder> {
    return this.woService.updateStatus(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '작업 지시 삭제' })
  @ApiResponse({ status: 200 })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.woService.remove(id);
  }
}
