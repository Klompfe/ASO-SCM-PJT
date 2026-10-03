import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PackingReceipt, PackingMaterialCategory } from './entities/packing-receipt.entity';
import { PackingReceiptRoll } from './entities/packing-receipt-roll.entity';
import { PackingReceiptCarton } from './entities/packing-receipt-carton.entity';
import { BomItem } from '../boms/entities/bom-item.entity';
import { CreatePackingReceiptDto } from './dto/create-packing-receipt.dto';
import { UploadPackingReceiptDto } from './dto/upload-packing-receipt.dto';
import { FindPackingReceiptsDto } from './dto/find-packing-receipts.dto';
import { PackingReceiptExcelParser } from './utils/packing-receipt-excel-parser.util';
import {
  buildPackingReceiptTemplateBuffer,
  parsePackingReceiptTemplate,
  PackingReceiptTemplateContext,
} from './utils/packing-receipt-template.util';
import { MidoPriceTableService } from '../mido-price-table/mido-price-table.service';

// PR-169: createdAt(timestamp, @CreateDateColumn)은 TypeORM이 실제 Date 인스턴스로
// 돌려주는데, String(dateInstance)는 "Sat Oct 03 2026..."(toString() 형식)이라 그냥
// slice(0,10)하면 날짜가 아니라 요일/월/일만 잘린 쓰레기값이 된다 — Date 인스턴스는
// toISOString()으로 먼저 변환해야 한다. targetRdd(date 컬럼)는 드라이버가 이미 문자열로
// 주는 경우가 많아 문제가 없었지만, 둘 다 같은 함수로 안전하게 처리한다.
const day = (v?: Date | string | null): string | null => {
  if (!v) return null;
  const iso = v instanceof Date ? v.toISOString() : String(v);
  return iso.slice(0, 10);
};

const sum = (arr: { [key: string]: any }[], key: string): number =>
  arr.reduce((total, item) => total + (Number(item[key]) || 0), 0);

// receivedDate(date 컬럼)를 문자열 그대로 비교해 sqlite/postgres 결과를 맞춘다(cash-vouchers와 동일).
function buildDateWhere(from?: string, to?: string) {
  if (from && to) return Between(from as any, to as any);
  if (from) return MoreThanOrEqual(from as any);
  if (to) return LessThanOrEqual(to as any);
  return undefined;
}

@Injectable()
export class PackingReceiptsService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(PackingReceipt)
    private readonly receiptRepository: Repository<PackingReceipt>,
    @InjectRepository(PackingReceiptRoll)
    private readonly rollRepository: Repository<PackingReceiptRoll>,
    @InjectRepository(PackingReceiptCarton)
    private readonly cartonRepository: Repository<PackingReceiptCarton>,
    @InjectRepository(BomItem)
    private readonly bomItemRepository: Repository<BomItem>,
    private readonly midoPriceTableService: MidoPriceTableService,
  ) {}

  private async findPurchaseOrderOrFail(purchaseOrderId: number): Promise<PurchaseOrder> {
    const po = await this.purchaseOrderRepository.findOne({ where: { id: purchaseOrderId } });
    if (!po) {
      throw new NotFoundException(`ID가 ${purchaseOrderId}인 발주를 찾을 수 없습니다.`);
    }
    return po;
  }

  // PR-169: 발주(PurchaseOrder)에는 styleNo/브랜드/바이어/생산처가 저장되어 있지 않다
  // (export-shipments.service.ts generate()와 동일한 이유 — PO.itemId로 BomItem을
  // 찾아 bom.style(→overview)까지 타고 들어가야 한다). BOM에 연결되지 않은 자재는
  // 포장내역 양식 자체를 내려줄 수 없으므로 명확한 안내로 막는다.
  private async resolveBomItemOrFail(po: PurchaseOrder): Promise<BomItem> {
    const bomItem = await this.bomItemRepository.findOne({
      where: { material: { id: po.itemId } },
      relations: ['bom', 'bom.style', 'bom.style.overview', 'material'],
      order: { id: 'DESC' },
    });
    if (!bomItem) {
      throw new BadRequestException(
        `발주 ID ${po.id}(품목: ${po.item?.name ?? po.itemId})가 어떤 자재명세(BOM)에도 연결되어 있지 않아 포장내역 양식에 필요한 스타일 정보를 확인할 수 없습니다. 먼저 BOM에 이 자재를 등록해 주세요.`,
      );
    }
    return bomItem;
  }

  async buildTemplateContext(purchaseOrderId: number): Promise<PackingReceiptTemplateContext> {
    const po = await this.purchaseOrderRepository.findOne({
      where: { id: purchaseOrderId },
      relations: ['item', 'supplier'],
    });
    if (!po) {
      throw new NotFoundException(`ID가 ${purchaseOrderId}인 발주를 찾을 수 없습니다.`);
    }
    const bomItem = await this.resolveBomItemOrFail(po);
    const overview = bomItem.bom.style.overview;

    const midoPriceCandidates =
      po.unitPrice == null
        ? (await this.midoPriceTableService.findCandidates(bomItem.material?.name ?? po.item?.name ?? '')).map((c) => ({
            itemName: c.itemName,
            priceUsdMin: Number(c.priceUsdMin),
            priceUsdMax: Number(c.priceUsdMax),
            unit: c.unit,
          }))
        : [];

    return {
      purchaseOrderId: po.id,
      styleNo: bomItem.bom.style.styleNo ?? null,
      brand: overview?.brand ?? null,
      buyer: overview?.buyer ?? null,
      factory: overview?.factory ?? null,
      supplierName: po.supplier?.name ?? null,
      orderedDate: day(po.createdAt),
      targetRdd: day(overview?.targetRdd),
      itemName: bomItem.material?.name ?? po.item?.name ?? null,
      itemEnglishName: bomItem.material?.englishName ?? null,
      composition: bomItem.composition ?? null,
      hsCode: bomItem.hsCode ?? null,
      unitPrice: po.unitPrice != null ? Number(po.unitPrice) : null,
      quantity: Number(po.quantity),
      midoPriceCandidates,
    };
  }

  async downloadTemplate(
    purchaseOrderId: number,
    materialCategory: PackingMaterialCategory,
  ): Promise<{ filename: string; buffer: Buffer }> {
    const ctx = await this.buildTemplateContext(purchaseOrderId);
    const buffer = buildPackingReceiptTemplateBuffer(ctx, materialCategory);
    const safeStyleNo = (ctx.styleNo ?? 'unknown').replace(/[^a-zA-Z0-9-]/g, '');
    const filename = `포장내역_${safeStyleNo}_PO${purchaseOrderId}_${materialCategory}.xlsx`;
    return { filename, buffer };
  }

  // 업로드된 표준양식을 파싱만 하고 저장하지 않는다(안전모드 2단계 — AI분석 커밋과
  // 동일한 패턴). 상단 컨텍스트(PO No./스타일번호)는 DB에서 새로 조회한 실제 값과
  // 대조하므로, 업로드 시점에 PO가 바뀌었거나 잘못된 파일이면 여기서 막힌다.
  async previewTemplateUpload(
    purchaseOrderId: number,
    buffer: Buffer,
    materialCategory: PackingMaterialCategory,
  ): Promise<CreatePackingReceiptDto & { warnings: string[]; declaredPackageCount: number | null }> {
    const po = await this.findPurchaseOrderOrFail(purchaseOrderId);
    const bomItem = await this.resolveBomItemOrFail(po);

    const parsed = parsePackingReceiptTemplate(buffer, materialCategory, {
      purchaseOrderId,
      styleNo: bomItem.bom.style.styleNo ?? null,
    });

    return {
      materialCategory,
      cbm: parsed.cbm ?? undefined,
      remark: parsed.packageType ?? undefined,
      rolls: materialCategory === PackingMaterialCategory.FABRIC ? parsed.rolls : undefined,
      cartons: materialCategory === PackingMaterialCategory.TRIM ? parsed.cartons : undefined,
      warnings: parsed.warnings,
      declaredPackageCount: parsed.declaredPackageCount,
    };
  }

  // materialCategory에 맞는 배열만 왔는지 확인한다 — FABRIC인데 cartons만 보내거나
  // TRIM인데 rolls만 보내는 실수를 조용히 무시하지 않고 바로 400으로 알린다.
  private validateDirectInputPayload(dto: CreatePackingReceiptDto): void {
    if (dto.materialCategory === PackingMaterialCategory.FABRIC) {
      if (!dto.rolls || dto.rolls.length === 0) {
        throw new BadRequestException('materialCategory가 FABRIC이면 rolls 배열이 최소 1건 필요합니다.');
      }
    } else {
      if (!dto.cartons || dto.cartons.length === 0) {
        throw new BadRequestException('materialCategory가 TRIM이면 cartons 배열이 최소 1건 필요합니다.');
      }
    }
  }

  async create(purchaseOrderId: number, dto: CreatePackingReceiptDto): Promise<PackingReceipt> {
    await this.findPurchaseOrderOrFail(purchaseOrderId);
    this.validateDirectInputPayload(dto);

    const receipt = await this.receiptRepository.save(
      this.receiptRepository.create({
        purchaseOrderId,
        materialCategory: dto.materialCategory,
        receivedDate: dto.receivedDate ? new Date(dto.receivedDate) : null,
        remark: dto.remark ?? null,
        cbm: dto.cbm ?? null,
      }),
    );

    if (dto.materialCategory === PackingMaterialCategory.FABRIC) {
      await this.rollRepository.save(
        dto.rolls!.map((r) => this.rollRepository.create({ ...r, packingReceiptId: receipt.id })),
      );
    } else {
      await this.cartonRepository.save(
        dto.cartons!.map((c) => this.cartonRepository.create({ ...c, packingReceiptId: receipt.id })),
      );
    }

    return this.findOneWithTotals(receipt.id);
  }

  async createFromExcel(
    purchaseOrderId: number,
    buffer: Buffer,
    dto: UploadPackingReceiptDto,
  ): Promise<PackingReceipt> {
    await this.findPurchaseOrderOrFail(purchaseOrderId);

    const receipt = await this.receiptRepository.save(
      this.receiptRepository.create({
        purchaseOrderId,
        materialCategory: dto.materialCategory,
        receivedDate: dto.receivedDate ? new Date(dto.receivedDate) : null,
        remark: dto.remark ?? null,
        cbm: dto.cbm ?? null,
      }),
    );

    // 파서가 인식 가능한 양식을 못 찾으면 BadRequestException을 던진다(조용히 잘못
    // 파싱하지 않는다) — 이 경우 이미 저장한 receipt 헤더 행도 함께 정리한다.
    try {
      if (dto.materialCategory === PackingMaterialCategory.FABRIC) {
        const rolls = PackingReceiptExcelParser.parseFabricRolls(buffer);
        await this.rollRepository.save(
          rolls.map((r) => this.rollRepository.create({ ...r, packingReceiptId: receipt.id })),
        );
      } else {
        const cartons = PackingReceiptExcelParser.parseTrimCartons(buffer);
        await this.cartonRepository.save(
          cartons.map((c) => this.cartonRepository.create({ ...c, packingReceiptId: receipt.id })),
        );
      }
    } catch (err) {
      await this.receiptRepository.delete({ id: receipt.id });
      throw err;
    }

    return this.findOneWithTotals(receipt.id);
  }

  async findAllByPurchaseOrder(purchaseOrderId: number): Promise<any[]> {
    await this.findPurchaseOrderOrFail(purchaseOrderId);
    const receipts = await this.receiptRepository.find({
      where: { purchaseOrderId },
      relations: ['rolls', 'cartons'],
      order: { id: 'DESC', rolls: { id: 'ASC' }, cartons: { id: 'ASC' } } as any,
    });
    return receipts.map((r) => this.attachTotals(r));
  }

  // PR-118: 집계 보고서용 — 부자재(TRIM, 카톤 단위) 포장내역만. 입고일이 없는 건(null)은 기간 필터를
  // 걸면 자연스럽게 빠지고, 필터가 없으면 포함된다. 어느 발주/공급업체/품목인지 함께 내려준다.
  async findAllForReport(filter: FindPackingReceiptsDto = {}): Promise<PackingReceipt[]> {
    const dateWhere = buildDateWhere(filter.from, filter.to);
    return this.receiptRepository.find({
      where: {
        materialCategory: PackingMaterialCategory.TRIM,
        ...(dateWhere ? { receivedDate: dateWhere } : {}),
      },
      relations: { cartons: true, purchaseOrder: { supplier: true, item: true } },
      order: { receivedDate: 'DESC', id: 'DESC', cartons: { id: 'ASC' } } as any,
    });
  }

  private async findOneWithTotals(id: number): Promise<any> {
    const receipt = await this.receiptRepository.findOne({
      where: { id },
      relations: ['rolls', 'cartons'],
      // 원본 엑셀/직접입력 순서 그대로 보이도록 id 오름차순으로 고정한다 — 관계
      // 조회는 명시하지 않으면 순서가 보장되지 않는다.
      order: { rolls: { id: 'ASC' }, cartons: { id: 'ASC' } } as any,
    });
    return this.attachTotals(receipt!);
  }

  // 롤/카톤 합계(개수, 중량, 수량)를 응답에 함께 실어 프론트가 별도로 계산하지 않게 한다.
  private attachTotals(receipt: PackingReceipt): any {
    if (receipt.materialCategory === PackingMaterialCategory.FABRIC) {
      const rolls = receipt.rolls ?? [];
      return {
        ...receipt,
        totals: {
          rollCount: rolls.length,
          totalGrossWeight: sum(rolls, 'grossWeight'),
          totalNetWeight: sum(rolls, 'netWeight'),
          totalLengthYd: sum(rolls, 'lengthYd'),
        },
      };
    }
    const cartons = receipt.cartons ?? [];
    return {
      ...receipt,
      totals: {
        cartonCount: new Set(cartons.map((c) => c.cartonNo)).size,
        lineCount: cartons.length,
        totalQty: sum(cartons, 'qty'),
        totalWeightKg: sum(cartons, 'weightKg'),
      },
    };
  }
}
