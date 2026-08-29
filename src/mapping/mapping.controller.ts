import { Controller, Post, UseInterceptors, UploadedFile, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MappingService } from './services/mapping.service';
import { ValidationService } from './services/validation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { StandardDataMapper } from './utils/standard-data-mapper.util';

@ApiTags('데이터 매핑 API')
@Controller('mapping')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MappingController {
  constructor(
    private readonly mappingService: MappingService,
    private readonly validationService: ValidationService,
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
    if (!file) throw new Error('File not uploaded');
    
    // Convert buffer to string rows
    const content = file.buffer.toString('utf-8');
    const rows = content.split('\r\n').map(line => line.split(','));
    
    // Execute pipeline: Mapping -> Validation
    const data = StandardDataMapper.parse(rows);
    const { errors } = await this.validationService.validate(data);
    
    return {
      success: true,
      rows: data.map((item, index) => ({
        ...item,
        rowNum: index + 1,
        errors: errors.filter(e => e.row === index).map(e => e.message)
      }))
    };
  }
}
