import { Controller, Post, UseInterceptors, UploadedFile, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MappingService } from './services/mapping.service';
import { ValidationService } from './services/validation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { StandardDataMapper } from './utils/standard-data-mapper.util';
import * as iconv from 'iconv-lite';

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
    console.log('Parsed File:', file ? file.originalname : 'No file uploaded');
    let data: any[] = [];

    if (file) {
      let content = file.buffer.toString('utf-8');
      if (content.includes('\uFFFD')) {
          content = iconv.decode(file.buffer, 'euc-kr');
      }
      const rows = content.split(/\r?\n/).map(line => line.split(','));
      data = StandardDataMapper.parse(rows);
    }
    
    return {
      success: true,
      rows: data.map((item: any, index: number) => ({
        id: `item_${index + 1}`,
        rowNum: index + 1,
        itemName: item.itemName,
        orderQty: item.orderQty,
        colorOf: item.colorOf,
        colorUsed: item.colorUsed,
        spec: item.spec,
        consumption: item.consumption,
        requiredQty: item.requiredQty,
        poDate: item.poDate,
        poQty: item.poQty,
        shipment1Date: item.shipment1Date,
        shipment1RcvdQty: item.shipment1RcvdQty,
        bln: item.bln,
        shipment2Date: item.shipment2Date,
        shipment2RcvdQty: item.shipment2RcvdQty,
        supplier: item.supplier,
        unitPrice: item.unitPrice,
        remarks: item.remarks,
        status: item.status || 'MAPPED'
      }))
    };
  }
}
