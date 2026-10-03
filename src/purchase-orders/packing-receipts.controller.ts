import 'multer';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PackingReceiptsService } from './packing-receipts.service';
import { CreatePackingReceiptDto } from './dto/create-packing-receipt.dto';
import { UploadPackingReceiptDto } from './dto/upload-packing-receipt.dto';
import { PackingMaterialCategory } from './entities/packing-receipt.entity';

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

  // PR-169: 다운로드 파일 자체를 바이너리로 응답하지 않고(이 코드베이스에 @Res() 바이너리
  // 응답 전례가 없다) base64로 감싸 기존 JSON 컨트롤러 스타일을 유지한다 — 프론트의
  // excelExport.ts/ShipmentsManager.tsx가 이미 쓰는 "Blob 만들어 다운로드 트리거" 패턴과
  // 그대로 맞물린다(Bearer 인증 헤더가 필요해 <a href> 직접 다운로드는 쓸 수 없음).
  @Get('template')
  @ApiOperation({ summary: '공급업체 포장내역 표준양식 다운로드(발주 컨텍스트 자동 채움)' })
  @ApiQuery({ name: 'materialCategory', enum: PackingMaterialCategory })
  async downloadTemplate(
    @Param('purchaseOrderId', ParseIntPipe) purchaseOrderId: number,
    @Query('materialCategory') materialCategory: PackingMaterialCategory,
  ) {
    if (!materialCategory || !Object.values(PackingMaterialCategory).includes(materialCategory)) {
      throw new BadRequestException('materialCategory 쿼리 파라미터(FABRIC 또는 TRIM)가 필요합니다.');
    }
    const { filename, buffer } = await this.packingReceiptsService.downloadTemplate(purchaseOrderId, materialCategory);
    return { filename, base64: buffer.toString('base64') };
  }

  @Post('template/preview')
  @ApiOperation({ summary: '표준양식 업로드 파싱(미리보기만, 저장하지 않음 — 확인 후 POST /로 커밋)' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'materialCategory', enum: PackingMaterialCategory })
  @UseInterceptors(FileInterceptor('file'))
  async previewTemplateUpload(
    @Param('purchaseOrderId', ParseIntPipe) purchaseOrderId: number,
    @Query('materialCategory') materialCategory: PackingMaterialCategory,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('업로드할 엑셀 파일이 없습니다.');
    }
    if (!materialCategory || !Object.values(PackingMaterialCategory).includes(materialCategory)) {
      throw new BadRequestException('materialCategory 쿼리 파라미터(FABRIC 또는 TRIM)가 필요합니다.');
    }
    return this.packingReceiptsService.previewTemplateUpload(purchaseOrderId, file.buffer, materialCategory);
  }
}
