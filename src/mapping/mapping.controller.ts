import { Controller, Post, UseInterceptors, UploadedFile, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FileInterceptor } from '@nestjs/platform-express';
import { MappingService } from './services/mapping.service';
import { ValidationService } from './services/validation.service';
import { StyleValidatorService } from './services/style-validator.service';
import { StagingParseRaw } from './entities/staging-parse-raw.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { SectionParser } from './utils/section-parser.util';
import { ExcelParser } from './utils/excel-parser.util';
import * as iconv from 'iconv-lite';

@ApiTags('데이터 매핑 API')
@Controller('mapping')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MappingController {
  constructor(
    private readonly mappingService: MappingService,
    private readonly validationService: ValidationService,
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
    
    let rows: string[][];
    const isExcel = file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls');
    
    let parseResult: any;
    let errorMessage: string | null = null;

    try {
        if (isExcel) {
            rows = ExcelParser.parse(file.buffer);
        } else {
            let content = file.buffer.toString('utf-8');
            if (content.includes('\uFFFD')) content = iconv.decode(file.buffer, 'euc-kr');
            rows = content.split(/\r?\n/).map(line => line.split(','));
        }
        parseResult = SectionParser.parse(rows);
    } catch (e) {
        errorMessage = (e as Error).message;
    }

    // Save to Staging
    await this.stagingRepo.save({
        fileName: file.originalname,
        raw_header_json: parseResult ? JSON.stringify(parseResult.styleOverview) : null,
        raw_bom_json: parseResult ? JSON.stringify(parseResult.bomItems) : null,
        error_message: errorMessage
    });

    if (errorMessage) throw new Error(errorMessage);
    
    const { styleOverview, bomItems } = parseResult;
    const styleNoFromDoc = styleOverview.styleNo;
    const validation = this.styleValidator.validate(file.originalname, styleNoFromDoc);
    
    return {
      success: true,
      styleNo: validation.docStyle || 'N/A',
      matchStatus: validation.matchStatus,
      overview: styleOverview,
      bomItems: bomItems.map((item: any, idx: number) => ({ id: idx + 1, ...item }))
    };
  }
}
