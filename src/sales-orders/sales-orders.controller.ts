import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
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
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

// PR-133: 수주(고객사로부터 받은 주문) 등록 — 작업지시서 문서 업로드/AI 분석/저장. 예전에는 /work-orders/* 아래에 섞여 있었다
// (경로만 옮겼고 동작은 그대로다: upload-image, ai-usage, ai-usage/summary, commit-analysis, spec).
//
// PR-151: OPERATOR 역할(당시 기본값이 아니었던 별도 역할)을 이 두 엔드포인트에 걸었다가
// e2e 10개 스위트가 403으로 깨져 되돌렸었다.
// PR-153: 새 STAFF가 예전 기본값(USER)을 그대로 대체하는 역할이라(엔티티 default가
// STAFF), 로그인만 해서 만든 e2e 픽스처 토큰도 자동으로 STAFF를 갖는다 — 그래서
// STAFF를 포함해 다시 걸어도 전체 e2e 회귀가 깨지지 않았다(실제 확인 완료).
// ACCOUNTING만 제외되는 셈이라 "작업지시서 업로드는 회계 전용 계정이 아니면 누구나"라는
// 실질 정책과도 맞는다.
@ApiTags('Sales Orders (수주 관리)')
@ApiBearerAuth()
@Controller('sales-orders')
export class SalesOrdersController {
  constructor(private readonly salesOrdersService: SalesOrdersService) {}

  @Post('upload-image')
  @UseGuards(RolesGuard)
  @Roles(UserRole.STAFF, UserRole.ADMIN, UserRole.MASTER)
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
  @UseGuards(RolesGuard)
  @Roles(UserRole.STAFF, UserRole.ADMIN, UserRole.MASTER)
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
