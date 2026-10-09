import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PackingReceiptsService } from './packing-receipts.service';
import { buildPurchaseOrderDocumentBuffer, PurchaseOrderDocumentContext } from './utils/purchase-order-document.util';

// 발주서에 찍히는 날짜는 한국 날짜 기준이어야 한다(UTC로 자르면 자정 전후 발주가 하루 밀린다).
const day = (v?: Date | string | null): string | null => {
  if (!v) return null;
  if (!(v instanceof Date)) return String(v).slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(v);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

// PR-178: 발주서 문서 생성. 품목 쪽 정보(영문명/규격/혼용률/HS/납기/생산처)는 포장내역
// 양식과 같은 BOM 체인(PackingReceiptsService.buildTemplateContext)에서 가져온다.
@Injectable()
export class PurchaseOrderDocumentService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly poRepository: Repository<PurchaseOrder>,
    private readonly packingReceiptsService: PackingReceiptsService,
  ) {}

  async generate(id: number): Promise<{ filename: string; buffer: Buffer }> {
    const po = await this.poRepository.findOne({ where: { id }, relations: ['supplier', 'item'] });
    if (!po) {
      throw new NotFoundException(`ID가 ${id}인 발주를 찾을 수 없습니다.`);
    }
    const bom = await this.packingReceiptsService.buildTemplateContext(id);

    const ctx: PurchaseOrderDocumentContext = {
      purchaseOrderId: po.id,
      orderDate: day(po.createdAt),
      requiredDate: bom.targetRdd ?? null,
      supplierName: po.supplier?.name ?? null,
      supplierContact: po.supplier?.contactPhone ?? null,
      supplierAddress: po.supplier?.address ?? null,
      itemName: bom.itemName,
      itemEnglishName: bom.itemEnglishName,
      composition: bom.composition,
      hsCode: bom.hsCode,
      // PR-185: 발주가 명시적으로 스타일에 연결돼 있으면 그 값을 우선한다(BOM 추정값보다
      // 신뢰도가 높음 — 사람이 직접 연결/확인한 값). 미연결 발주는 기존처럼 BOM 추정값.
      styleNo: po.styleNo ?? bom.styleNo,
      factory: bom.factory,
      quantity: Number(po.quantity),
      unitPrice: po.unitPrice != null ? Number(po.unitPrice) : null,
      notes: po.notes ?? null,
      lines: [],
    };
    const buffer = buildPurchaseOrderDocumentBuffer(ctx);
    return { filename: `발주서_PO${po.id}_${bom.styleNo ?? 'unknown'}.xlsx`.replace(/[^\w가-힣._-]/g, ''), buffer };
  }
}
