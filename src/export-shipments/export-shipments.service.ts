import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, LessThanOrEqual, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { PurchaseOrder } from '../purchase-orders/entities/purchase-order.entity';
import { PackingReceipt, PackingMaterialCategory } from '../purchase-orders/entities/packing-receipt.entity';
import { BomItem } from '../boms/entities/bom-item.entity';
import { ExportShipment, ExportShipmentStatus, ExportShipmentSource } from './entities/export-shipment.entity';
import { ExportShipmentLine } from './entities/export-shipment-line.entity';
import { GenerateExportShipmentDto } from './dto/generate-export-shipment.dto';
import { FindExportShipmentsDto } from './dto/find-export-shipments.dto';
import { UpdateExportShipmentLineDto } from './dto/update-export-shipment-line.dto';
import { UserRole } from '../users/entities/user.entity';
import { ExportShipmentDefaultsService } from '../export-shipment-defaults/export-shipment-defaults.service';
import { ExportShipmentImportParser } from './utils/export-shipment-import-parser.util';
import { FindExportPerformanceDto } from './dto/find-export-performance.dto';
import { aggregateExportPerformance, type BuyerByStyleNo } from './utils/export-performance.util';
import { MasterStyle } from '../styles/entities/master-style.entity';
import { BrandPrefixRulesService } from '../brand-prefix-rules/brand-prefix-rules.service';

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
    private readonly exportShipmentDefaultsService: ExportShipmentDefaultsService,
    private readonly brandPrefixRulesService: BrandPrefixRulesService,
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
  //
  // PR-079: shipperInfo/consigneeInfo/portOfLoading/finalDestination/carrier는
  // 건마다 거의 바뀌지 않는 회사 고정정보라 ExportShipmentDefaults(싱글턴)에서
  // 기본값을 가져와 채운다. dto로 값이 넘어오면(개별 건에서 예외적으로 다르게
  // 나가는 경우) 그 값이 우선한다. sheetNo/invoiceDate/sailingDate는 건마다
  // 달라지는 값이라 기본값 대상이 아니다 — dto 값만 그대로 쓴다.
  async generate(
    purchaseOrderIds: number[],
    dto: GenerateExportShipmentDto,
  ): Promise<ExportShipment & { warnings: string[] }> {
    if (!purchaseOrderIds || purchaseOrderIds.length === 0) {
      throw new BadRequestException('purchaseOrderIds는 최소 1개 이상이어야 합니다.');
    }

    const linesToCreate: Partial<ExportShipmentLine>[] = [];
    const styleNoSet = new Set<string>();
    // PR-086: qty는 PurchaseOrder.quantity(발주수량)가 아니라 실제 등록된
    // PackingReceipt의 롤 개수/카톤 수량 합계로 계산된다(설계상 의도 — INVOICE는
    // 실제 포장된 수량을 반영해야 함). 이 설계는 그대로 두고, 발주수량과 차이가
    // 있으면 조용히 넘어가지 않고 warnings로 알려준다(DB에는 저장하지 않음 —
    // 생성 시점에 한 번 계산해서 응답으로만 내려주는 값).
    const warnings: string[] = [];

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

      let packedQty = 0;
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
          packedQty += rolls.length;
        } else {
          const cartons = receipt.cartons ?? [];
          const cartonQty = sum(cartons, 'qty');
          linesToCreate.push({
            styleNo,
            packingReceiptId: receipt.id,
            description,
            hsCode: bomItem.hsCode ?? null,
            qty: cartonQty,
            unit: itemUnit || 'EA',
            netWeight: null,
            grossWeight: sum(cartons, 'weightKg') || null,
            packageCount: new Set(cartons.map((c) => c.cartonNo)).size,
            packageType: 'CARTON',
          });
          packedQty += cartonQty;
        }
      }

      const orderedQty = Number(po.quantity);
      const diff = packedQty - orderedQty;
      if (diff !== 0) {
        warnings.push(
          `발주 ID ${po.id}(스타일 ${styleNo}): 발주수량 ${orderedQty} vs 실제 포장수량 ${packedQty} (차이 ${diff})`,
        );
      }
    }

    // PR-079: 기본값이 아직 한 번도 설정된 적 없으면 find()가 null을 반환한다 —
    // 이 경우 에러 없이 그냥 dto 값(없으면 null)만으로 진행한다(헤더 공란 유지).
    const defaults = await this.exportShipmentDefaultsService.find();

    const shipment = await this.exportShipmentRepository.save(
      this.exportShipmentRepository.create({
        styleNos: Array.from(styleNoSet),
        status: ExportShipmentStatus.DRAFT,
        sheetNo: dto.sheetNo ?? null,
        invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : null,
        shipperInfo: dto.shipperInfo ?? defaults?.shipperInfo ?? null,
        consigneeInfo: dto.consigneeInfo ?? defaults?.consigneeInfo ?? null,
        portOfLoading: dto.portOfLoading ?? defaults?.portOfLoading ?? null,
        finalDestination: dto.finalDestination ?? defaults?.finalDestination ?? null,
        carrier: dto.carrier ?? defaults?.carrier ?? null,
        sailingDate: dto.sailingDate ? new Date(dto.sailingDate) : null,
      }),
    );

    await this.exportShipmentLineRepository.save(
      linesToCreate.map((l) =>
        this.exportShipmentLineRepository.create({ ...l, exportShipmentId: shipment.id }),
      ),
    );

    const saved = await this.findOneOrFail(shipment.id);
    return Object.assign(saved, { warnings });
  }

  // PR-080: 이미 완성되어 있던 INVOICE/Packing List 엑셀을 그대로 가져와 DRAFT로
  // 즉시 등록한다(발주/BOM/포장내역을 거치지 않는다 — 이미 완성된 문서를 재계산
  // 없이 그대로 저장하는 것이 목적). qty/unitPrice/amount/netWeight/grossWeight/
  // packageCount/packageType은 파일에 적힌 값 그대로 저장한다.
  async importFromFile(buffer: Buffer): Promise<ExportShipment & { warnings: string[] }> {
    const parsed = ExportShipmentImportParser.parse(buffer);

    // shipper/consignee는 주소 블록이 여러 줄에 걸쳐 있어 파일에서 직접 파싱하지
    // 않는다(PR-079 기본값이 있으면 그 값을 쓰고, 없으면 DRAFT 상태에서 사람이
    // 직접 채운다) — generate()와 동일한 폴백 로직을 재사용한다.
    const defaults = await this.exportShipmentDefaultsService.find();

    const shipment = await this.exportShipmentRepository.save(
      this.exportShipmentRepository.create({
        styleNos: Array.from(new Set(parsed.lines.map((l) => l.styleNo).filter((s) => s))),
        status: ExportShipmentStatus.DRAFT,
        source: ExportShipmentSource.IMPORTED,
        sheetNo: parsed.header.sheetNo,
        invoiceDate: parsed.header.invoiceDate,
        shipperInfo: defaults?.shipperInfo ?? null,
        consigneeInfo: defaults?.consigneeInfo ?? null,
        portOfLoading: parsed.header.portOfLoading,
        finalDestination: parsed.header.finalDestination,
        carrier: parsed.header.carrier,
        sailingDate: parsed.header.sailingDate,
      }),
    );

    await this.exportShipmentLineRepository.save(
      parsed.lines.map((l) =>
        this.exportShipmentLineRepository.create({
          ...l,
          exportShipmentId: shipment.id,
          packingReceiptId: null,
        }),
      ),
    );

    const saved = await this.findOneOrFail(shipment.id);
    return Object.assign(saved, { warnings: parsed.warnings });
  }

  // PR-102: 스타일번호/자재명/선적건번호 검색 — 셋 다 선택적, AND 결합. styleNo/
  // materialName은 ExportShipmentLine을 조인해서 판별한다("한 선적서류 안에 여러
  // 라인/스타일이 섞여 있을 수 있으므로 라인 중 하나라도 (두 조건을 함께) 만족하면
  // 그 선적서류를 포함"). 필터가 매칭된 선적서류 id만 먼저 뽑고, 화면에는 그
  // 선적서류의 라인을 전부(필터에 안 걸린 라인도) 보여줘야 하므로 id로 다시
  // 전체 라인을 조회한다.
  async findAll(filter?: FindExportShipmentsDto): Promise<ExportShipment[]> {
    const hasFilter = !!(filter?.styleNo || filter?.materialName || filter?.sheetNo);
    if (!hasFilter) {
      return this.exportShipmentRepository.find({
        relations: ['lines'],
        order: { id: 'DESC', lines: { id: 'ASC' } } as any,
      });
    }

    const qb = this.exportShipmentRepository
      .createQueryBuilder('shipment')
      .leftJoin('shipment.lines', 'line')
      .select('shipment.id', 'id')
      .distinct(true);

    if (filter?.styleNo) {
      qb.andWhere('line.styleNo LIKE :styleNo', { styleNo: `%${filter.styleNo}%` });
    }
    if (filter?.materialName) {
      qb.andWhere('line.description LIKE :materialName', { materialName: `%${filter.materialName}%` });
    }
    if (filter?.sheetNo) {
      qb.andWhere('shipment.sheetNo LIKE :sheetNo', { sheetNo: `%${filter.sheetNo}%` });
    }

    const rows = await qb.getRawMany();
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return [];

    return this.exportShipmentRepository.find({
      where: { id: In(ids) },
      relations: ['lines'],
      order: { id: 'DESC', lines: { id: 'ASC' } } as any,
    });
  }

  // PR-119: 수출 실적표. FINALIZED 문서만 집계하고(DB 조건 + 집계 함수에서 한 번 더 확인), 같은 기간의
  // 미확정(DRAFT/REVIEWED) 문서 수는 "제외된 건수"로 따로 알려준다. 기간은 invoiceDate 기준(양끝 포함,
  // date 컬럼을 문자열 그대로 비교해 sqlite/postgres 결과를 맞춘다).
  async getPerformance(filter: FindExportPerformanceDto = {}) {
    const { from, to } = filter;
    const dateWhere = from && to ? Between(from as any, to as any) : from ? MoreThanOrEqual(from as any) : to ? LessThanOrEqual(to as any) : undefined;
    const periodWhere = dateWhere ? { invoiceDate: dateWhere } : {};

    const [finalized, excludedNotFinalized, rules] = await Promise.all([
      this.exportShipmentRepository.find({
        where: { status: ExportShipmentStatus.FINALIZED, ...periodWhere },
        relations: ['lines'],
        order: { id: 'ASC', lines: { id: 'ASC' } } as any,
      }),
      this.exportShipmentRepository.count({ where: { status: Not(ExportShipmentStatus.FINALIZED), ...periodWhere } }),
      this.brandPrefixRulesService.findAll(),
    ]);

    // PR-121: 거래처는 라인 스타일의 StyleOverview.buyer로 얻는다(ExportShipment에는 거래처 FK가 없다).
    const styleNos = [...new Set(finalized.flatMap((s) => (s.lines ?? []).map((l) => l.styleNo)))];
    const buyerByStyleNo: BuyerByStyleNo = {};
    if (styleNos.length > 0) {
      const styles = await this.exportShipmentRepository.manager.find(MasterStyle, {
        where: { styleNo: In(styleNos) },
        relations: ['overview'],
      });
      for (const st of styles) buyerByStyleNo[st.styleNo] = st.overview?.buyer ?? null;
    }

    return { ...aggregateExportPerformance(finalized, rules, { from, to }, buyerByStyleNo), excludedNotFinalized };
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
  // ADMIN/MASTER만 — 두 전이가 같은 엔드포인트를 쓰므로 RolesGuard 데코레이터로는
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
      if (userRole !== UserRole.ADMIN && userRole !== UserRole.MASTER) {
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
