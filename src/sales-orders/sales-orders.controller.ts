import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  FileTypeValidator,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody, ApiQuery } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { SalesOrdersService } from './sales-orders.service';
import { AiSalesOrderResultDto } from './dto/ai-analysis.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';

// PR-133: 수주(고객사로부터 받은 주문) 등록 — 작업지시서 문서 업로드/AI 분석/저장. 예전에는 /work-orders/* 아래에 섞여 있었다
// (경로만 옮겼고 동작은 그대로다: upload-image, ai-usage, ai-usage/summary, commit-analysis, spec).
//
// PR-151: OPERATOR 역할을 이 두 엔드포인트(upload-image/commit-analysis)에 @Roles()로
// 걸어봤으나, 기존 e2e 테스트 10개 스위트(goods-receipt/order-progress-summary/
// import-shipments-search-filter/contract-approval/master-style-delete/rbac-flow/
// sales-order-commit-analysis-merge 등, 전부 다른 기능을 검증하면서 이 두 API를
// "아무 로그인 사용자나 쓸 수 있는 테스트 픽스처 생성 도구"로 재사용하고 있었다)가
// 403으로 깨져 되돌렸다 — 실제로 걸려면 그 테스트들의 토큰 생성 로직도 함께
// MANAGER/OPERATOR로 바꿔야 하는데, 이 PR 범위를 크게 벗어나는 규모라 별도 PR로
// 넘긴다(완료 보고에 근거와 함께 명시).
@ApiTags('Sales Orders (수주 관리)')
@ApiBearerAuth()
@Controller('sales-orders')
export class SalesOrdersController {
  constructor(private readonly salesOrdersService: SalesOrdersService) {}

  @Post('upload-image')
  @ApiOperation({ summary: '수주 등록 — 작업지시서 이미지 분석' })
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
    return await this.salesOrdersService.analyzeImage(file, user.userId);
  }

  @Get('ai-usage')
  @ApiOperation({ summary: '내 작업지시서 AI 분석 사용량/과금 이력 조회' })
  async getAiUsage(@GetUser() user: any) {
    return this.salesOrdersService.getAiUsageForUser(user.userId);
  }

  @Get('ai-usage/summary')
  @ApiOperation({ summary: '내 작업지시서 AI 분석 누적 사용량/과금 요약' })
  async getAiUsageSummary(@GetUser() user: any) {
    return this.salesOrdersService.getAiUsageSummaryForUser(user.userId);
  }

  @Post('commit-analysis')
  @ApiOperation({ summary: '수주 등록 — 작업지시서 AI 분석 결과 최종 저장 (오더개요+자재명세+작업명세)' })
  async commitAnalysis(@Body() dto: AiSalesOrderResultDto) {
    return this.salesOrdersService.commitAnalysis(dto);
  }

  @Get('spec')
  @ApiOperation({ summary: '스타일별 작업명세(사이즈 스펙+지시사항) 조회' })
  @ApiQuery({ name: 'styleNo', required: true, example: 'MB62SLM103Z' })
  async findSpec(@Query('styleNo') styleNo: string) {
    if (!styleNo) {
      throw new BadRequestException('styleNo는 필수입니다.');
    }
    return this.salesOrdersService.findSpecByStyleNo(styleNo);
  }
}
