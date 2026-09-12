import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseOrder } from '../purchase-orders/entities/purchase-order.entity';
import { PackingReceipt, PackingMaterialCategory } from '../purchase-orders/entities/packing-receipt.entity';
import { BomItem } from '../boms/entities/bom-item.entity';
import { ExportShipment, ExportShipmentStatus } from './entities/export-shipment.entity';
import { ExportShipmentLine } from './entities/export-shipment-line.entity';
import { GenerateExportShipmentDto } from './dto/generate-export-shipment.dto';
import { UpdateExportShipmentLineDto } from './dto/update-export-shipment-line.dto';
import { UserRole } from '../users/entities/user.entity';

const sum = (arr: { [key: string]: any }[], key: string): number =>
  arr.reduce((total, item) => total + (Number(item[key]) || 0), 0);

// DRAFT -> REVIEWED -> FINALIZED만 허용, 역행 불가(PR-075 4.5절/9.2절 계약 승인과 동일 원칙).
const ALLOWED_TRANSITIONS: Record<ExportShipmentStatus, ExportShipmentStatus[]> = {
  [ExportShipmentStatus.DRAFT]: [ExportShipmentStatus.REVIEWED],
  [ExportShipmentStatus.REVIEWED]: [ExportShipmentStatus.FINALIZED],
  [ExportShipmentStatus.FINALIZED]: [],
};

@Injectable()
export class ExportShipmentsService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(PackingReceipt)
    private readonly packingReceiptRepository: Repository<PackingReceipt>,
    @InjectRepository(BomItem)
    private readonly bomItemRepository: Repository<BomItem>,
    @InjectRepository(ExportShipment)
    private readonly exportShipmentRepository: Repository<ExportShipment>,
    @InjectRepository(ExportShipmentLine)
    private readonly exportShipmentLineRepository: Repository<ExportShipmentLine>,
  ) {}

  // PR-075: purchaseOrderIds(들)의 PackingReceipt를 styleNo+자재 기준으로 집계해
  // ExportShipmentLine을 자동 생성한다.
  //
  // styleNo는 PurchaseOrder/PackingReceipt 어디에도 저장되지 않는 값이라(PR-074에서
  // "중복 저장하지 마라"는 지시를 따라 저장하지 않았다), 발주의 품목(Item)이 실제로
  // 쓰인 가장 최근 BomItem을 통해 역으로 찾는다(BomItem.material -> Item,
  // BomItem.bom.style -> MasterStyle.styleNo). description(spec+englishName+
  // composition)과 hsCode도 이 BomItem에서 그대로 가져온다. 이 자재가 어떤 BOM에도
  // 쓰인 적이 없으면 스타일/규격/혼용율을 알 수 없으므로 조용히 넘어가지 않고
  // 명확한 에러로 먼저 BOM 등록을 안내한다.
  //
  // PR-078: unit은 자재마스터(Item.unit)를 우선 사용한다 — 기존 데이터 중에는
  // Item.unit이 비어있는 경우도 있어(과거 등록분 등), 비어 있으면 이전처럼
  // 원단은 'ROLL', 부자재는 'EA'로 폴백한다.
  //
  // 알려진 한계(원본 PackingReceiptRoll 모델에 실측 길이(야드/미터) 필드가 없어):
  // 원단(FABRIC) 라인의 qty는 실제 INVOICE의 "YDS/MTS" 수치가 아니라 롤 개수로
  // 집계한다 — Item.unit이 'MTS' 등으로 지정돼 있어도 표시 단위만 그렇게 보일 뿐,
  // qty 값 자체는 여전히 롤 개수라는 점에 주의. 부자재(TRIM)는 카톤 내 qty 합계를
  // 그대로 쓴다. 실제 운영에 맞추려면 PackingReceiptRoll에 길이 필드를 추가하는
  // 후속 작업이 필요하다 — 이번 PR은 description 자동생성과 상태관리 흐름이
  // 핵심이라 이 부분은 명시적으로 근사치로 남겨둔다.
  async generate(purchaseOrderIds: number[], dto: GenerateExportShipmentDto): Promise<ExportShipment> {
    if (!purchaseOrderIds || purchaseOrderIds.length === 0) {
      throw new BadRequestException('purchaseOrderIds는 최소 1개 이상이어야 합니다.');
    }

    const linesToCreate: Partial<ExportShipmentLine>[] = [];
    const styleNoSet = new Set<string>();

    for (const purchaseOrderId of purchaseOrderIds) {
      const po = await this.purchaseOrderRepository.findOne({
        where: { id: purchaseOrderId },
        relations: ['item'],
      });
      if (!po) {
        throw new NotFoundException(`ID가 ${purchaseOrderId}인 발주를 찾을 수 없습니다.`);
      }

      const bomItem = await this.bomItemRepository.findOne({
        where: { material: { id: po.itemId } },
        relations: ['bom', 'bom.style', 'material'],
        order: { id: 'DESC' },
      });
      if (!bomItem) {
        throw new BadRequestException(
          `발주 ID ${purchaseOrderId}(품목: ${po.item?.name ?? po.itemId})가 어떤 자재명세(BOM)에도 연결되어 있지 않아 ` +
            'INVOICE에 필요한 스타일/규격/혼용율 정보를 확인할 수 없습니다. 먼저 BOM에 이 자재를 등록해 주세요.',
        );
      }

      const styleNo = bomItem.bom.style.styleNo;
      styleNoSet.add(styleNo);
      const description = [bomItem.spec, bomItem.material?.englishName, bomItem.composition]
        .filter((v) => v != null && String(v).trim() !== '')
        .join(' ');
      const itemUnit = bomItem.material?.unit?.trim();

      const receipts = await this.packingReceiptRepository.find({
        where: { purchaseOrderId },
        relations: ['rolls', 'cartons'],
      });
      if (receipts.length === 0) {
        throw new BadRequestException(
          `발주 ID ${purchaseOrderId}에 등록된 포장내역이 없습니다. 먼저 포장내역을 등록해 주세요.`,
        );
      }

      for (const receipt of receipts) {
        if (receipt.materialCategory === PackingMaterialCategory.FABRIC) {
          const rolls = receipt.rolls ?? [];
          linesToCreate.push({
            styleNo,
            packingReceiptId: receipt.id,
            description,
            hsCode: bomItem.hsCode ?? null,
            qty: rolls.length,
            unit: itemUnit || 'ROLL',
            netWeight: sum(rolls, 'netWeight') || null,
            grossWeight: sum(rolls, 'grossWeight') || null,
            packageCount: rolls.length,
            packageType: null,
          });
        } else {
          const cartons = receipt.cartons ?? [];
          linesToCreate.push({
            styleNo,
            packingReceiptId: receipt.id,
            description,
            hsCode: bomItem.hsCode ?? null,
            qty: sum(cartons, 'qty'),
            unit: itemUnit || 'EA',
            netWeight: null,
            grossWeight: sum(cartons, 'weightKg') || null,
            packageCount: new Set(cartons.map((c) => c.cartonNo)).size,
            packageType: 'CARTON',
          });
        }
      }
    }

    const shipment = await this.exportShipmentRepository.save(
      this.exportShipmentRepository.create({
        styleNos: Array.from(styleNoSet),
        status: ExportShipmentStatus.DRAFT,
        sheetNo: dto.sheetNo ?? null,
        invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : null,
        shipperInfo: dto.shipperInfo ?? null,
        consigneeInfo: dto.consigneeInfo ?? null,
        portOfLoading: dto.portOfLoading ?? null,
        finalDestination: dto.finalDestination ?? null,
        carrier: dto.carrier ?? null,
        sailingDate: dto.sailingDate ? new Date(dto.sailingDate) : null,
      }),
    );

    await this.exportShipmentLineRepository.save(
      linesToCreate.map((l) =>
        this.exportShipmentLineRepository.create({ ...l, exportShipmentId: shipment.id }),
      ),
    );

    return this.findOneOrFail(shipment.id);
  }

  async findAll(): Promise<ExportShipment[]> {
    return this.exportShipmentRepository.find({
      relations: ['lines'],
      order: { id: 'DESC', lines: { id: 'ASC' } } as any,
    });
  }

  async findOneOrFail(id: number): Promise<ExportShipment> {
    const shipment = await this.exportShipmentRepository.findOne({
      where: { id },
      relations: ['lines'],
      order: { lines: { id: 'ASC' } } as any,
    });
    if (!shipment) {
      throw new NotFoundException(`ID가 ${id}인 수출선적서류를 찾을 수 없습니다.`);
    }
    return shipment;
  }

  // DRAFT->REVIEWED는 누구나(인증된 사용자), REVIEWED->FINALIZED는 계약 승인과 동일하게
  // MANAGER/ADMIN만 — 두 전이가 같은 엔드포인트를 쓰므로 RolesGuard 데코레이터로는
  // 표현할 수 없어 서비스 레이어에서 조건부로 검사한다.
  async updateStatus(
    id: number,
    newStatus: ExportShipmentStatus,
    userRole: UserRole,
  ): Promise<ExportShipment> {
    const shipment = await this.findOneOrFail(id);

    const allowedNextStates = ALLOWED_TRANSITIONS[shipment.status];
    if (!allowedNextStates.includes(newStatus)) {
      throw new BadRequestException(
        `${shipment.status} 상태에서 ${newStatus}(으)로 전이할 수 없습니다. (허용: ${allowedNextStates.join(', ') || '없음'})`,
      );
    }

    if (newStatus === ExportShipmentStatus.FINALIZED) {
      if (userRole !== UserRole.MANAGER && userRole !== UserRole.ADMIN) {
        throw new ForbiddenException('FINALIZED 확정은 관리자 권한이 필요합니다.');
      }
    }

    shipment.status = newStatus;
    await this.exportShipmentRepository.save(shipment);
    return this.findOneOrFail(id);
  }

  // 5절: unitPrice는 사람이 직접 입력하는 유일한 편집 필드. FINALIZED된 문서는
  // 스냅샷으로 고정되어 이후 수정할 수 없다(9.2절 계약 스냅샷과 동일 원칙).
  async updateLineUnitPrice(
    exportShipmentId: number,
    lineId: number,
    dto: UpdateExportShipmentLineDto,
  ): Promise<ExportShipmentLine> {
    const shipment = await this.findOneOrFail(exportShipmentId);
    if (shipment.status === ExportShipmentStatus.FINALIZED) {
      throw new BadRequestException('FINALIZED 상태의 문서는 더 이상 수정할 수 없습니다.');
    }

    const line = await this.exportShipmentLineRepository.findOne({ where: { id: lineId } });
    if (!line || line.exportShipmentId !== exportShipmentId) {
      throw new NotFoundException(`ID가 ${lineId}인 라인을 찾을 수 없습니다.`);
    }

    line.unitPrice = dto.unitPrice ?? null;
    line.amount = line.unitPrice != null ? line.unitPrice * Number(line.qty) : null;
    return this.exportShipmentLineRepository.save(line);
  }
}
