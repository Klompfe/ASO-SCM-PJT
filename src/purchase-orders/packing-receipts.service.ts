import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PackingReceipt, PackingMaterialCategory } from './entities/packing-receipt.entity';
import { PackingReceiptRoll } from './entities/packing-receipt-roll.entity';
import { PackingReceiptCarton } from './entities/packing-receipt-carton.entity';
import { CreatePackingReceiptDto } from './dto/create-packing-receipt.dto';
import { UploadPackingReceiptDto } from './dto/upload-packing-receipt.dto';
import { PackingReceiptExcelParser } from './utils/packing-receipt-excel-parser.util';

const sum = (arr: { [key: string]: any }[], key: string): number =>
  arr.reduce((total, item) => total + (Number(item[key]) || 0), 0);

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
  ) {}

  private async findPurchaseOrderOrFail(purchaseOrderId: number): Promise<PurchaseOrder> {
    const po = await this.purchaseOrderRepository.findOne({ where: { id: purchaseOrderId } });
    if (!po) {
      throw new NotFoundException(`ID가 ${purchaseOrderId}인 발주를 찾을 수 없습니다.`);
    }
    return po;
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
