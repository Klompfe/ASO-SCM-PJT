import { Controller, Post, UseInterceptors, UploadedFile } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FileInterceptor } from '@nestjs/platform-express';
import { MappingService } from './services/mapping.service';
import { StyleValidatorService } from './services/style-validator.service';
import { StagingParseRaw } from './entities/staging-parse-raw.entity';
import { ApiTags, ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { SectionParser } from './utils/section-parser.util';
import { ExcelParser, ParsedWorkbookSheet } from './utils/excel-parser.util';
import * as iconv from 'iconv-lite';

@ApiTags('데이터 매핑 API')
@Controller('mapping')
@ApiBearerAuth()
export class MappingController {
  constructor(
    private readonly mappingService: MappingService,
    private readonly styleValidator: StyleValidatorService,
    @InjectRepository(StagingParseRaw) private readonly stagingRepo: Repository<StagingParseRaw>,
  ) {}

  @Post('parse')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async parseExcel(@UploadedFile() file: Express.Multer.File) {
    console.log('[API REQUEST] POST /mapping/parse');
    if (!file) throw new Error('No file');

    const isExcel = file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls');

    let sheets: ParsedWorkbookSheet[];
    if (isExcel) {
      sheets = ExcelParser.parseWorkbook(file.buffer).sheets;
    } else {
      let content = file.buffer.toString('utf-8');
      if (content.includes('�')) content = iconv.decode(file.buffer, 'euc-kr');
      const rows = content.split(/\r?\n/).map(line => line.split(','));
      sheets = [{ sheetName: file.originalname, rows, merges: [] }];
    }

    const parsedSheets = SectionParser.parseWorkbook(sheets);

    // 시트별로 Staging에 원본 파싱 결과(성공/실패 모두)를 남긴다.
    await Promise.all(
      parsedSheets.map((sheet) =>
        this.stagingRepo.save({
          fileName: `${file.originalname} :: ${sheet.sheetName}`,
          raw_header_json: sheet.styleOverview ? JSON.stringify(sheet.styleOverview) : null,
          raw_bom_json: sheet.bomItems ? JSON.stringify(sheet.bomItems) : null,
          error_message: sheet.parseError || null,
        }),
      ),
    );

    // matchStatus(파일명 vs STYLE NO)는 시트 하나당 파일 하나를 전제로 한 검증이라
    // 다중 시트 응답에서는 더 이상 의미가 없다 — 검증 방식은 별도로 다시 논의한다.
    return parsedSheets.map((sheet) => ({
      sheetName: sheet.sheetName,
      styleNo: sheet.styleOverview?.styleNo,
      matchStatus: null,
      overview: sheet.styleOverview,
      bomItems: sheet.bomItems?.map((item: any, idx: number) => ({ id: idx + 1, ...item })),
      parseError: sheet.parseError,
    }));
  }
}
