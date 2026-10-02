import 'multer';
import { BadRequestException, Controller, Get, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SalesContractPricesService } from './sales-contract-prices.service';

// PR-166: CMT매입단가 표준가격 — SALES CONTRACT 통합본 업로드 + 스타일별 단가 조회.
@ApiTags('CMT매입단가 표준가격 (Sales Contract Prices)')
@ApiBearerAuth()
@Controller('sales-contract-prices')
export class SalesContractPricesController {
  constructor(private readonly service: SalesContractPricesService) {}

  @Post('import')
  @ApiOperation({ summary: 'SALES CONTRACT 통합본 업로드 — 기존 데이터를 전부 교체한다' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('업로드할 파일이 없습니다.');
    }
    return this.service.importFromExcel(file.buffer);
  }

  @Get('resolve')
  @ApiOperation({ summary: '스타일번호 기준 CMT매입단가 표준가격 조회(정확매칭 -> 브랜드×품종 평균 -> 수동확인 대기)' })
  @ApiQuery({ name: 'styleNo', required: true, example: 'BF6821C13' })
  @ApiQuery({ name: 'itemType', required: false, example: "WOMEN'S PANTS" })
  resolve(@Query('styleNo') styleNo: string, @Query('itemType') itemType?: string) {
    if (!styleNo) {
      throw new BadRequestException('styleNo는 필수입니다.');
    }
    return this.service.resolve(styleNo, itemType);
  }

  @Get('status')
  @ApiOperation({ summary: '현재 적재된 참고 데이터 건수/마지막 임포트 시각' })
  status() {
    return this.service.count();
  }
}
