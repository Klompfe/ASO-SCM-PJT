import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PackingReceiptsService } from './packing-receipts.service';
import {
  buildPurchaseOrderDocumentBuffer,
  buildCombinedPurchaseOrderDocumentBuffer,
  CombinedPurchaseOrderDocumentContext,
  CombinedPurchaseOrderDocumentLine,
  PurchaseOrderDocumentContext,
} from './utils/purchase-order-document.util';
import { Bom } from '../boms/entities/bom.entity';
import { MasterStyle } from '../styles/entities/master-style.entity';
import { pickActiveBom } from '../boms/utils/active-bom.util';
import { effectiveSubType, materialSubTypeLabel } from '../common/utils/packaging-subtype.util';
import { MaterialPackagingUnitRulesService } from '../material-packaging-unit-rules/material-packaging-unit-rules.service';

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
    private readonly dataSource: DataSource,
    private readonly materialPackagingUnitRulesService: MaterialPackagingUnitRulesService,
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

  // PR-194: 다품번 일괄발주 — 여러 발주(스타일별로 따로 저장된 것)를 업체별로 묶어
  // 발주서 1장씩 만든다. 발주 1건 = 품목 1개 × 스타일 1개 구조(스타일별 부족분·입고
  // 추적)는 그대로 두고, 이 메서드는 "업체에 보내는 서류"만 합친다.
  async generateCombined(poIds: number[]): Promise<{ supplierId: number; supplierName: string; filename: string; buffer: Buffer }[]> {
    const orders = await this.poRepository.find({ where: poIds.map((id) => ({ id })), relations: ['supplier', 'item', 'item.category'] });
    const foundIds = new Set(orders.map((o) => o.id));
    const missing = poIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(`존재하지 않는 발주입니다: ${missing.join(', ')}`);
    }
    const unassigned = orders.filter((o) => !o.supplierId);
    if (unassigned.length > 0) {
      throw new BadRequestException(
        `공급업체가 지정되지 않은 발주가 있습니다: ${unassigned.map((o) => `#${o.id}(${o.item?.name ?? '품목 미상'})`).join(', ')}`,
      );
    }

    // 스타일별 BOM 구분(카테고리 폴백)·실테이프 종류·요구납기를 한 번에 조회한다
    // (발주마다 개별 쿼리하면 N+1이 되므로 스타일 단위로 묶어서 가져온다).
    const styleNos = [...new Set(orders.map((o) => o.styleNo).filter((s): s is string => !!s))];
    const styleInfoByStyleNo = new Map<string, { targetRdd: string | null; itemMeta: Map<number, { category: string | null; threadType?: string | null; tapeType?: string | null }> }>();
    for (const styleNo of styleNos) {
      const style = await this.dataSource.manager.findOne(MasterStyle, { where: { styleNo }, relations: ['overview'] });
      const targetRdd = style?.overview?.targetRdd ? String(style.overview.targetRdd).slice(0, 10) : null;
      const boms = await this.dataSource.manager.find(Bom, { where: { style: { styleNo } }, order: { id: 'DESC' } });
      const latest = pickActiveBom(boms);
      const itemMeta = new Map<number, { category: string | null; threadType?: string | null; tapeType?: string | null }>();
      if (latest) {
        const bom = await this.dataSource.manager.findOne(Bom, { where: { id: latest.id }, relations: ['items', 'items.material'] });
        for (const bi of bom?.items ?? []) {
          if (!bi.material) continue;
          if (!itemMeta.has(bi.material.id)) {
            itemMeta.set(bi.material.id, { category: (bi.category ?? '').trim() || null, threadType: bi.threadType, tapeType: bi.tapeType });
          }
        }
      }
      styleInfoByStyleNo.set(styleNo, { targetRdd, itemMeta });
    }

    const packagingRules = await this.materialPackagingUnitRulesService.findAll();

    const bySupplier = new Map<number, PurchaseOrder[]>();
    for (const po of orders) {
      const list = bySupplier.get(po.supplierId!) ?? [];
      list.push(po);
      bySupplier.set(po.supplierId!, list);
    }

    const today = day(new Date()) ?? '';
    const results: { supplierId: number; supplierName: string; filename: string; buffer: Buffer }[] = [];
    for (const [supplierId, poList] of bySupplier.entries()) {
      const supplier = poList[0].supplier!;
      const lines: CombinedPurchaseOrderDocumentLine[] = poList.map((po) => {
        const styleInfo = po.styleNo ? styleInfoByStyleNo.get(po.styleNo) : undefined;
        const bomMeta = po.item ? styleInfo?.itemMeta.get(po.item.id) : undefined;
        const categoryGroup = po.item?.category?.name ?? bomMeta?.category ?? '미분류';
        const subtype = bomMeta ? effectiveSubType(bomMeta, po.item) : (po.item?.materialSubType ?? null);
        return {
          purchaseOrderId: po.id,
          categoryGroup,
          materialSubTypeLabel: materialSubTypeLabel(subtype, packagingRules),
          itemCode: po.item?.code ?? null,
          itemName: po.item?.name ?? '(품목 미상)',
          unit: po.item?.unit ?? null,
          styleNo: po.styleNo ?? null,
          quantity: Number(po.quantity),
          unitPrice: po.unitPrice != null ? Number(po.unitPrice) : null,
          requiredDate: styleInfo?.targetRdd ?? null,
          notes: po.notes ?? null,
        };
      });

      const ctx: CombinedPurchaseOrderDocumentContext = {
        orderDate: today,
        supplierName: supplier.name,
        supplierContact: supplier.contactPhone ?? null,
        supplierAddress: supplier.address ?? null,
        lines,
      };
      const buffer = buildCombinedPurchaseOrderDocumentBuffer(ctx);
      const filename = `발주서_${supplier.name}_${today}.xlsx`.replace(/[^\w가-힣._-]/g, '');
      results.push({ supplierId, supplierName: supplier.name, filename, buffer });
    }
    return results;
  }
}
