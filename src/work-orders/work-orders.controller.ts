import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  Query,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  FileTypeValidator,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody, ApiQuery } from '@nestjs/swagger';
import { WorkOrdersService } from './work-orders.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderStatusDto } from './dto/update-work-order-status.dto';
import { WorkOrder } from './entities/work-order.entity';
import { GetWorkOrdersFilterDto } from './dto/get-work-orders-filter.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiWorkOrderResultDto } from './dto/ai-analysis.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Work Orders (작업 지시 관리)')
@ApiBearerAuth()
@Controller('work-orders')
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
    @GetUser() user: any,
  ) {
    return await this.woService.analyzeWorkOrderImage(file, user.userId);
  }

  @Get('ai-usage')
  @ApiOperation({ summary: '내 작업지시서 AI 분석 사용량/과금 이력 조회' })
  async getAiUsage(@GetUser() user: any) {
    return this.woService.getAiUsageForUser(user.userId);
  }

  @Get('ai-usage/summary')
  @ApiOperation({ summary: '내 작업지시서 AI 분석 누적 사용량/과금 요약' })
  async getAiUsageSummary(@GetUser() user: any) {
    return this.woService.getAiUsageSummaryForUser(user.userId);
  }

  @Post('commit-analysis')
  @ApiOperation({ summary: '작업지시서 AI 분석 결과 최종 저장 (오더개요+자재명세+작업명세)' })
  async commitAnalysis(@Body() dto: AiWorkOrderResultDto) {
    return this.woService.commitAnalysis(dto);
  }

  @Get('spec')
  @ApiOperation({ summary: '스타일별 작업명세(사이즈 스펙+지시사항) 조회' })
  @ApiQuery({ name: 'styleNo', required: true, example: 'MB62SLM103Z' })
  async findSpec(@Query('styleNo') styleNo: string) {
    if (!styleNo) {
      throw new BadRequestException('styleNo는 필수입니다.');
    }
    return this.woService.findSpecByStyleNo(styleNo);
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
