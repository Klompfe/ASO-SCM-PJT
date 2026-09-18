import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { GoodsReceipt } from './entities/goods-receipt.entity';
import { GoodsReceiptLine } from './entities/goods-receipt-line.entity';
import { ImportShipmentPackingDetail } from '../import-shipments/entities/import-shipment-packing-detail.entity';
import { ImportShipment } from '../import-shipments/entities/import-shipment.entity';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';

// "GR-{YY}{4자리 일련번호}" — Supplier/Buyer(PR-085/088)와 동일한 TOCTOU 재시도
// 채번 패턴이지만, 이 문서는 업체 약칭이 없어 접두사가 연도뿐이라 로직이 더 단순하다.
const RECEIPT_PREFIX = 'GR';
const MAX_RECEIPT_NO_RETRIES = 3;

@Injectable()
export class GoodsReceiptsService {
  private readonly logger = new Logger(GoodsReceiptsService.name);

  constructor(
    @InjectRepository(GoodsReceipt)
    private readonly goodsReceiptRepository: Repository<GoodsReceipt>,
    @InjectRepository(GoodsReceiptLine)
    private readonly goodsReceiptLineRepository: Repository<GoodsReceiptLine>,
    @InjectRepository(ImportShipmentPackingDetail)
    private readonly packingDetailRepository: Repository<ImportShipmentPackingDetail>,
    @InjectRepository(ImportShipment)
    private readonly importShipmentRepository: Repository<ImportShipment>,
  ) {}

  private async generateNextReceiptNo(yy: string): Promise<string> {
    const prefix = `${RECEIPT_PREFIX}-${yy}`;
    const existing = await this.goodsReceiptRepository.find({ where: { receiptNo: Like(`${prefix}%`) } });

    let maxSeq = 0;
    for (const receipt of existing) {
      const suffix = receipt.receiptNo.slice(prefix.length);
      if (/^\d{4}$/.test(suffix)) {
        maxSeq = Math.max(maxSeq, Number(suffix));
      }
    }
    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  }

  // 요구사항: "선택된 행들이 그대로 라인으로 복사되어 나타남... 저장 시 GoodsReceipt
  // 1건 + 선택된 라인 수만큼의 GoodsReceiptLine 생성." 조정 수량이 원 수량과
  // 다르면 사유가 반드시 있어야 한다(없으면 400) — DTO가 아니라 여기서 검증하는
  // 이유는 originalQty가 클라이언트가 보내는 값이 아니라 서버가 packingDetail에서
  // 조회한 값이기 때문이다.
  async create(dto: CreateGoodsReceiptDto): Promise<GoodsReceipt> {
    const shipment = await this.importShipmentRepository.findOne({ where: { id: dto.importShipmentId } });
    if (!shipment) {
      throw new NotFoundException(`ID가 ${dto.importShipmentId}인 수입통관 문서를 찾을 수 없습니다.`);
    }

    const lineInputs: { detail: ImportShipmentPackingDetail; adjustedQty: number; adjustmentReason: string | null }[] = [];
    for (const lineDto of dto.lines) {
      const detail = await this.packingDetailRepository.findOne({ where: { id: lineDto.packingDetailId } });
      if (!detail || detail.importShipmentId !== dto.importShipmentId) {
        throw new NotFoundException(
          `ID가 ${lineDto.packingDetailId}인 상세내역을 이 수입통관 문서(#${dto.importShipmentId})에서 찾을 수 없습니다.`,
        );
      }

      const originalQty = Number(detail.qty);
      const adjustedQty = lineDto.adjustedQty ?? originalQty;
      const isAdjusted = adjustedQty !== originalQty;

      if (isAdjusted && !lineDto.adjustmentReason?.trim()) {
        throw new BadRequestException(
          `상세내역(색상 ${detail.color}, 사이즈 ${detail.size})의 수량을 ${originalQty} → ${adjustedQty}로 조정하려면 조정 사유가 필요합니다.`,
        );
      }

      lineInputs.push({
        detail,
        adjustedQty,
        adjustmentReason: isAdjusted ? lineDto.adjustmentReason!.trim() : (lineDto.adjustmentReason?.trim() ?? null),
      });
    }

    const yy = String(new Date().getFullYear() % 100).padStart(2, '0');
    for (let attempt = 1; attempt <= MAX_RECEIPT_NO_RETRIES; attempt++) {
      const receiptNo = await this.generateNextReceiptNo(yy);
      try {
        const receipt = this.goodsReceiptRepository.create({
          receiptNo,
          issuedDate: new Date(),
          importShipmentId: dto.importShipmentId,
          remark: dto.remark ?? null,
          lines: lineInputs.map((input) => ({
            packingDetailId: input.detail.id,
            styleNo: input.detail.styleNo,
            color: input.detail.color,
            size: input.detail.size,
            originalQty: Number(input.detail.qty),
            adjustedQty: input.adjustedQty,
            adjustmentReason: input.adjustmentReason,
          })),
        });
        const saved = await this.goodsReceiptRepository.save(receipt);
        return await this.findOneOrFail(saved.id);
      } catch (error) {
        const isUniqueViolation =
          (error as any)?.code === '23505' || (error as any)?.code === 'SQLITE_CONSTRAINT';
        if (!isUniqueViolation) throw error;
        this.logger.warn(`입고증 번호(${receiptNo}) 채번 충돌(${attempt}번째 시도) — 재계산 후 재시도합니다.`);
      }
    }

    throw new BadRequestException('입고증 번호 자동채번에 반복적으로 실패했습니다. 잠시 후 다시 시도해 주세요.');
  }

  async findAll(importShipmentId?: number): Promise<GoodsReceipt[]> {
    return this.goodsReceiptRepository.find({
      where: importShipmentId ? { importShipmentId } : {},
      relations: ['lines'],
      order: { id: 'DESC' },
    });
  }

  // PR-108: 발급(인쇄) 화면이 스타일번호/INVOICE 번호를 함께 보여줘야 해서
  // importShipment 관계도 함께 로드한다(목록 조회는 기존대로 lines만).
  async findOneOrFail(id: number): Promise<GoodsReceipt> {
    const receipt = await this.goodsReceiptRepository.findOne({
      where: { id },
      relations: ['lines', 'importShipment'],
    });
    if (!receipt) {
      throw new NotFoundException(`ID가 ${id}인 완제품입고증을 찾을 수 없습니다.`);
    }
    return receipt;
  }
}
