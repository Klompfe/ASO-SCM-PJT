import 'multer';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PackingReceiptsService } from './packing-receipts.service';
import { CreatePackingReceiptDto } from './dto/create-packing-receipt.dto';
import { UploadPackingReceiptDto } from './dto/upload-packing-receipt.dto';

// PR-074: 포장내역은 PurchaseOrder의 하위 흐름이라 독립 컨트롤러가 아니라
// /purchase-orders/:purchaseOrderId/packing-receipts 경로 아래에 둔다.
@ApiTags('포장내역 (Packing Receipts)')
@ApiBearerAuth()
@Controller('purchase-orders/:purchaseOrderId/packing-receipts')
export class PackingReceiptsController {
  constructor(private readonly packingReceiptsService: PackingReceiptsService) {}

  @Post()
  @ApiOperation({ summary: '포장내역 직접입력 등록(원단=roll[], 부자재=carton[])' })
  create(
    @Param('purchaseOrderId', ParseIntPipe) purchaseOrderId: number,
    @Body() dto: CreatePackingReceiptDto,
  ) {
    return this.packingReceiptsService.create(purchaseOrderId, dto);
  }

  @Post('upload')
  @ApiOperation({ summary: '포장내역 엑셀 업로드 (BEANPOLE_TTL형/MATERIAL PACKING LIST형만 지원)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('purchaseOrderId', ParseIntPipe) purchaseOrderId: number,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadPackingReceiptDto,
  ) {
    if (!file) {
      throw new BadRequestException('업로드할 엑셀 파일이 없습니다.');
    }
    return this.packingReceiptsService.createFromExcel(purchaseOrderId, file.buffer, dto);
  }

  @Get()
  @ApiOperation({ summary: '포장내역 목록 조회 (롤/카톤 합계 포함)' })
  findAll(@Param('purchaseOrderId', ParseIntPipe) purchaseOrderId: number) {
    return this.packingReceiptsService.findAllByPurchaseOrder(purchaseOrderId);
  }
}
