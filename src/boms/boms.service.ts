import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';
import { Bom } from './entities/bom.entity';
import { BomItem } from './entities/bom-item.entity';
import { UpdateBomItemDto } from './dto/update-bom-item.dto';
import { SwapBomItemMaterialDto } from './dto/swap-bom-item-material.dto';
import { RenameBomItemMaterialDto } from './dto/rename-bom-item-material.dto';
import { Item, ItemType } from '../items/entities/item.entity';
import { PurchaseOrder, PurchaseOrderStatus } from '../purchase-orders/entities/purchase-order.entity';
import { LABEL_SET } from './label-set.constants';
import { areBomContentsIdentical, normalizeMaterialName, pickActiveBom } from './utils/active-bom.util';
import { normalizeForFuzzyMatch } from './utils/bom-name-normalize.util';
import { resolveCurrencyInput } from '../common/constants/currency';
import { MasterStyle } from '../styles/entities/master-style.entity';
import { buildOuterFabricAudit, type OuterFabricAuditResponse } from './utils/outer-fabric-audit.util';
import { OuterFabricAuditQueryDto } from './dto/outer-fabric-audit-query.dto';

// PR-197: updateItem()이 돌려주는 변경 전 값 스냅샷 — 화면이 "요척 2.7 → 2.9" 같은
// 변경 전/후 확인 문구를 만들 수 있게 한다(감사 테이블은 만들지 않음, 서버 로그만 남김).
export interface BomItemBeforeSnapshot {
  composition: string | null | undefined;
  hsCode: string | null | undefined;
  threadType: string | null | undefined;
  tapeType: string | null | undefined;
  consumption: number;
  spec: string;
  colorCode: string;
  category: string;
  requiredQty: number;
  manualRequiredQty: number | null | undefined;
}

export interface DuplicateBomItemView {
  id: number;
  materialId: number | null;
  materialCode: string;
  materialName: string;
  category: string;
  colorCode: string;
  spec: string;
  consumption: number;
}

export interface DuplicateBomView {
  id: number;
  bomNo: string;
  version: string;
  isActive: boolean;
  itemCount: number;
  items: DuplicateBomItemView[];
}

export interface DuplicateBomStyleView {
  styleNo: string;
  bomCount: number;
  activeCount: number;
  // 모든 BOM의 (자재 레코드, 제품 1개당 소요량) 조합이 같으면 true.
  identical: boolean;
  // 자재 이름(줄바꿈/공백 정규화)과 소요량 조합이 같으면 true. identical=false인데 이것만 true이면
  // 내용은 같고 자재 마스터(Item) 레코드만 서로 다른 중복이다(구매/재고 매칭에는 영향이 있을 수 있다).
  sameByName: boolean;
  // 활성 BOM이 정확히 1건이 아니거나, 내용(이름·소요량 기준)이 서로 다르면 사람이 확인해야 한다.
  needsReview: boolean;
  boms: DuplicateBomView[];
}

export interface AddLabelSetResult {
  bom: Bom;
  added: string[];
  skipped: string[];
}

@Injectable()
export class BomsService {
  private readonly logger = new Logger(BomsService.name);

  constructor(
    @InjectRepository(Bom)
    private readonly bomRepository: Repository<Bom>,
    @InjectRepository(BomItem)
    private readonly bomItemRepository: Repository<BomItem>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    private readonly dataSource: DataSource,
  ) {}

  // 같은 style에 Bom이 여러 개 생성될 수 있는 알려진 이슈가 있어(CHARTER.md 5.2절), 화면/재고 차감/소요명세서가
  // 모두 같은 규칙(pickActiveBom: 활성 BOM 중 최신)으로 사용할 BOM을 고른다(PR-121에서 도입, PR-123에서 전 구간 통일).
  async findActiveByStyleNo(styleNo: string): Promise<Bom | null> {
    // 항목은 id 순으로 고정한다: ORDER BY가 없으면 PostgreSQL이 물리적 행 순서(UPDATE된 행은 뒤로 밀림)로 돌려줘서
    // 자재 마스터 병합 같은 UPDATE 이후 화면의 항목 순서가 바뀐다.
    const boms = await this.bomRepository.find({
      where: { style: { styleNo } },
      relations: ['items', 'items.material', 'style'],
      order: { items: { id: 'ASC' } } as any,
    });
    return pickActiveBom(boms);
  }

  // PR-073: 자재명세(BOM) 상세 화면에서 혼용율/HS코드를 인라인으로 수정한다.
  // PR-197: 요척/규격/색상/구분도 여기서 고칠 수 있다. 요척이 바뀌면 requiredQty(소요량
  // 스냅샷)도 "요척 × 스타일 총수량"으로 같이 갱신한다 — 실제 소요량 계산(work-orders 쪽
  // calculateMaterialRequirements)은 BomItem.requiredQty가 아니라 매번 consumption ×
  // targetQuantity로 다시 계산하므로 이 재계산이 그 값에 영향을 주지는 않지만, 이
  // 컬럼을 그대로 보여주는 다른 화면과 어긋나지 않게 스냅샷을 맞춰 둔다. 총수량이 없는
  // 스타일(StyleOverview 미등록 등)이면 requiredQty는 건드리지 않는다.
  async updateItem(id: number, dto: UpdateBomItemDto): Promise<BomItem & { before: BomItemBeforeSnapshot }> {
    const bomItem = await this.bomItemRepository.findOne({
      where: { id },
      relations: ['material', 'bom', 'bom.style', 'bom.style.overview'],
    });
    if (!bomItem) {
      throw new NotFoundException(`ID가 ${id}인 자재명세 항목을 찾을 수 없습니다.`);
    }

    const before: BomItemBeforeSnapshot = {
      composition: bomItem.composition,
      hsCode: bomItem.hsCode,
      threadType: bomItem.threadType,
      tapeType: bomItem.tapeType,
      consumption: Number(bomItem.consumption),
      spec: bomItem.spec,
      colorCode: bomItem.colorCode,
      category: bomItem.category,
      requiredQty: Number(bomItem.requiredQty),
      manualRequiredQty: bomItem.manualRequiredQty != null ? Number(bomItem.manualRequiredQty) : null,
    };

    if (dto.composition !== undefined) bomItem.composition = dto.composition;
    if (dto.hsCode !== undefined) bomItem.hsCode = dto.hsCode;
    if (dto.threadType !== undefined) bomItem.threadType = dto.threadType;
    if (dto.tapeType !== undefined) bomItem.tapeType = dto.tapeType;
    if (dto.spec !== undefined) bomItem.spec = dto.spec;
    if (dto.colorCode !== undefined) bomItem.colorCode = dto.colorCode;
    if (dto.category !== undefined) bomItem.category = dto.category;
    if (dto.consumption !== undefined) {
      bomItem.consumption = dto.consumption;
      const totalQty = Number(bomItem.bom?.style?.overview?.totalQty);
      if (Number.isFinite(totalQty) && totalQty > 0) {
        bomItem.requiredQty = Math.round(dto.consumption * totalQty * 10000) / 10000;
      }
    }
    // PR-241: 이 행만의 공급업체/단가 — 자재마스터·다른 스타일에는 영향 없다. 빈
    // 문자열/null은 "미정"으로 해제(기존 mapping-commit.service.ts의 null 관례와 동일).
    if (dto.supplier !== undefined) bomItem.supplier = dto.supplier || null;
    if (dto.unitPrice !== undefined) bomItem.unitPrice = dto.unitPrice;
    // PR-244a: 통화만 바꾼다 — 단가 숫자는 자동 환산하지 않는다(사용자가 새 통화로 직접 입력).
    const currency = resolveCurrencyInput(dto.currency);
    if (currency !== undefined) bomItem.currency = currency;

    // PR-231: 필요수량 직접 지정 — null을 보내면 세 컬럼 모두 해제(계산값으로 복귀).
    // 값을 보내면 그 값 + (같이 왔으면) 사유를 저장하고 지정 시각을 지금으로 기록한다.
    // 값은 보내지 않고 사유만 보내면(이미 지정된 값은 그대로 두고) 사유만 바꿀 수 있다.
    if (dto.manualRequiredQty !== undefined) {
      if (dto.manualRequiredQty === null) {
        bomItem.manualRequiredQty = null;
        bomItem.manualRequiredQtyNote = null;
        bomItem.manualRequiredQtyAt = null;
      } else {
        bomItem.manualRequiredQty = Math.round(dto.manualRequiredQty * 1000) / 1000;
        bomItem.manualRequiredQtyAt = new Date();
        if (dto.manualRequiredQtyNote !== undefined) bomItem.manualRequiredQtyNote = dto.manualRequiredQtyNote || null;
      }
    } else if (dto.manualRequiredQtyNote !== undefined) {
      bomItem.manualRequiredQtyNote = dto.manualRequiredQtyNote || null;
    }

    const saved = await this.bomItemRepository.save(bomItem);

    const after: Record<string, unknown> = { ...saved };
    for (const field of Object.keys(before) as (keyof BomItemBeforeSnapshot)[]) {
      const beforeValue = before[field];
      const afterValue =
        field === 'consumption' || field === 'requiredQty'
          ? Number(after[field])
          : field === 'manualRequiredQty'
            ? (after[field] != null ? Number(after[field]) : null)
            : after[field];
      if (beforeValue !== afterValue) {
        this.logger.log(`BomItem #${id} ${field}: ${beforeValue} → ${afterValue}`);
      }
    }

    return Object.assign(saved, { before });
  }

  // PR-197: 저장된 BOM 행 삭제 — 이 스타일 BOM에서만 빠진다. 자재 마스터(Item)와
  // 기존 발주(PurchaseOrder)는 절대 건드리지 않는다(재고·입고 로직 변경 없음). 같은
  // 자재로 이 스타일에 연결된 취소 아닌 발주가 있으면 삭제를 막지 않되 건수를 함께
  // 돌려줘 화면이 확인창에서 사람에게 알리게 한다.
  async deleteItem(id: number): Promise<{ deletedId: number; linkedPurchaseOrderCount: number }> {
    const bomItem = await this.bomItemRepository.findOne({
      where: { id },
      relations: ['material', 'bom', 'bom.style'],
    });
    if (!bomItem) {
      throw new NotFoundException(`ID가 ${id}인 자재명세 항목을 찾을 수 없습니다.`);
    }

    const styleNo = bomItem.bom?.style?.styleNo;
    const materialId = bomItem.material?.id;
    let linkedPurchaseOrderCount = 0;
    if (styleNo && materialId) {
      linkedPurchaseOrderCount = await this.purchaseOrderRepository.count({
        where: { styleNo, itemId: materialId, status: Not(PurchaseOrderStatus.CANCELLED) },
      });
    }

    await this.bomItemRepository.delete(id);
    this.logger.log(`BomItem #${id} 삭제됨(자재 마스터/발주는 유지) — 연결된 발주(취소 제외) ${linkedPurchaseOrderCount}건`);
    return { deletedId: id, linkedPurchaseOrderCount };
  }

  // PR-197: 이 BOM 행이 가리키는 자재를 이미 있는 다른 자재로 바꾼다(이름 오인식 교정
  // 용도). 없는 자재는 새로 만들지 않고 400 — 새 자재는 기존 자재 등록 화면에서만
  // 만든다. 스타일 연결 발주(PurchaseOrder.itemId)는 바꾸지 않는다(이 BOM 행과
  // 발주는 서로 다른 레코드 — 발주를 다른 자재로 옮기는 기능이 아니다).
  async swapMaterial(id: number, dto: SwapBomItemMaterialDto): Promise<BomItem> {
    const bomItem = await this.bomItemRepository.findOne({ where: { id }, relations: ['material'] });
    if (!bomItem) {
      throw new NotFoundException(`ID가 ${id}인 자재명세 항목을 찾을 수 없습니다.`);
    }

    let newMaterial: Item | null = null;
    if (dto.materialId != null) {
      newMaterial = await this.itemRepository.findOne({ where: { id: dto.materialId } });
    } else if (dto.materialName && dto.materialName.trim()) {
      newMaterial = await this.itemRepository.findOne({ where: { name: dto.materialName.trim() } });
    }
    if (!newMaterial) {
      throw new BadRequestException(
        '지정한 자재를 찾을 수 없습니다 — 이미 등록된 자재만 선택할 수 있습니다(새 자재는 자재 등록 화면에서 먼저 만들어 주세요).',
      );
    }

    const beforeMaterialId = bomItem.material?.id ?? null;
    bomItem.material = newMaterial;
    // PR-231: 수동 지정 값은 "이 자재(행)"에 대한 사람의 판단이라, 자재 자체가 바뀌면
    // 더 이상 유효하지 않다 — 이어지지 않는 것(초기화)이 기본(사용자 확정 요구사항).
    bomItem.manualRequiredQty = null;
    bomItem.manualRequiredQtyNote = null;
    bomItem.manualRequiredQtyAt = null;
    const saved = await this.bomItemRepository.save(bomItem);
    this.logger.log(`BomItem #${id} material: ${beforeMaterialId} → ${newMaterial.id}(${newMaterial.name})`);
    return saved;
  }

  // PR-241: "이 행만" 자재명 변경 — '자재 교체'(기존 자재 중에서 고르는 것)와 달리
  // 이름을 직접 입력받아, 정규화 이름(normalizeForFuzzyMatch, commit()과 같은 규칙)으로
  // 기존 Item을 찾아 연결하거나(없으면) 현재 Item의 속성을 복사해 새 Item을 만든다.
  // 이 행의 다른 값(색상·요척·비고·공급사·단가·수동 필요수량)은 그대로 유지한다
  // (사용자 확정: "이름 변경은 교체가 아니다") — swapMaterial과 달리 manualRequiredQty를
  // 지우지 않는다. 안전장치(단위 불일치/연결된 발주/중복 행)는 전부 서버가 강제한다.
  async renameMaterial(id: number, dto: RenameBomItemMaterialDto): Promise<{
    bomItem: BomItem;
    resultKind: 'linkedExisting' | 'createdNew';
    materialId: number;
    materialName: string;
  }> {
    const trimmedName = dto.name.trim();
    if (!trimmedName) {
      throw new BadRequestException('자재명을 입력해 주세요.');
    }

    const bomItem = await this.bomItemRepository.findOne({
      where: { id },
      relations: ['material', 'bom', 'bom.items', 'bom.items.material', 'bom.style'],
    });
    if (!bomItem) {
      throw new NotFoundException(`ID가 ${id}인 자재명세 항목을 찾을 수 없습니다.`);
    }
    const currentMaterial = bomItem.material;
    if (!currentMaterial) {
      throw new BadRequestException('이 행에 연결된 자재가 없어 이름을 바꿀 수 없습니다.');
    }

    // (c) 발주·입고(같은 PurchaseOrder의 상태 전이)·선적(발주를 거쳐 연결)이 있으면
    // "이 행만 변경"은 거부한다 — deleteItem과 같은 기준(이 스타일 + 이 자재 + 취소 제외).
    // MERGE-45 Gate A ②: 이 쿼리는 PurchaseOrder만 직접 본다 — 입고는 같은 PurchaseOrder의
    // 상태 전이(RECEIVED)라 그대로 포함되고, 선적 중 발주서를 거쳐 만들어진(GENERATED)
    // 문서는 PackingReceipt→PurchaseOrder로 연결돼 있어 이 발주 건수에 간접 포함된다.
    // 반면 기존 엑셀을 그대로 가져온(IMPORTED) 선적 문서는 품목 id 연결이 전혀 없는
    // 자유 텍스트라(ExportShipmentLine, PR-080) 이 쿼리로도, 다른 어떤 id 기반 쿼리로도
    // 검사할 수 없다 — 이름 변경으로 깨질 데이터가 없으므로(참조 자체가 없음) 범위
    // 밖으로 둔다. 문구가 "선적도 직접 검사한다"로 읽히지 않게 발주 기준으로만 쓴다.
    const styleNo = bomItem.bom?.style?.styleNo;
    if (styleNo) {
      const linkedCount = await this.purchaseOrderRepository.count({
        where: { styleNo, itemId: currentMaterial.id, status: Not(PurchaseOrderStatus.CANCELLED) },
      });
      if (linkedCount > 0) {
        throw new BadRequestException('이 자재로 만든 발주가 있는 행입니다(발주를 통해 입고·선적도 연결됩니다). 자재마스터 이름 변경(모든 스타일 적용)을 사용하세요.');
      }
    }

    // 정규화 이름이 같은 Item이 이미 여러 개면(과거 중복) id가 가장 작은(가장 오래된)
    // 것을 결정적으로 재사용한다 — commit()(mapping-commit.service.ts)과 같은 규칙.
    const normalizedNewName = normalizeForFuzzyMatch(trimmedName);
    const allItems = await this.itemRepository.find();
    const matched = allItems
      .filter((it) => normalizeForFuzzyMatch(it.name) === normalizedNewName)
      .sort((a, b) => a.id - b.id)[0] ?? null;

    let resultKind: 'linkedExisting' | 'createdNew';
    if (matched && matched.id !== currentMaterial.id) {
      // (b) 단위가 다른 자재로는 이름 변경으로 연결할 수 없다(수동 필요수량·포장 규칙이
      // 단위에 묶여 있어 뜻이 달라진다) — '자재 교체'를 쓰라고 안내한다.
      if ((currentMaterial.unit ?? '').trim() !== (matched.unit ?? '').trim()) {
        throw new BadRequestException("단위가 다른 자재로는 이름 변경으로 바꿀 수 없습니다. '자재 교체'를 사용하세요.");
      }
      // (d) 같은 스타일에 이미 같은 자재가 같은 색상·구분으로 있으면 거부(중복 행 방지).
      const duplicateRow = (bomItem.bom?.items ?? []).find(
        (bi) => bi.id !== bomItem.id && bi.material?.id === matched.id && bi.colorCode === bomItem.colorCode && bi.category === bomItem.category,
      );
      if (duplicateRow) {
        throw new BadRequestException('같은 스타일에 이미 같은 자재가 같은 색상·구분으로 있습니다.');
      }
      resultKind = 'linkedExisting';
    } else if (matched && matched.id === currentMaterial.id) {
      // 정규화 결과가 지금 자재 하나뿐(표기만 다르거나 실질적으로 안 바뀜) — 새로 만들지 않는다.
      resultKind = 'linkedExisting';
    } else {
      resultKind = 'createdNew';
    }

    // (e) 새 Item 생성 + 이 행 연결은 하나의 트랜잭션으로 묶는다(실패 시 전체 롤백).
    const saved = await this.dataSource.transaction(async (manager) => {
      const targetMaterial =
        resultKind === 'createdNew'
          ? await manager.save(Item, {
              code: `MAT-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
              name: trimmedName,
              type: currentMaterial.type,
              unit: currentMaterial.unit,
              spec: currentMaterial.spec,
              categoryId: currentMaterial.categoryId ?? null,
              materialSubType: currentMaterial.materialSubType ?? null,
              // 영문명(englishName)·공급사 마스터(vendor)는 복사하지 않는다(사용자 확정).
            })
          : (matched ?? currentMaterial);
      bomItem.material = targetMaterial;
      return manager.save(BomItem, bomItem);
    });

    this.logger.log(`BomItem #${id} 자재명 변경: material #${currentMaterial.id} → #${saved.material.id}(${resultKind})`);
    return { bomItem: saved, resultKind, materialId: saved.material.id, materialName: saved.material.name };
  }

  // PR-099: "라벨류 기본 세트 추가" — MAIN+SIZE LABEL/CARE LABEL/PRICE TAG/SIZE
  // STICKER/TAG PIN/이미지택/POLY BAG 7종을 수량 1로 한 번에 반영한다. 이미 같은
  // itemName이 그 스타일 BOM에 있으면 중복 추가하지 않고 건너뛴다(PR-098의 병합
  // 로직과 동일한 사상 — 기존 값을 실수로 갈아엎지 않는다).
  async addLabelSet(styleNo: string): Promise<AddLabelSetResult> {
    const bom = await this.findActiveByStyleNo(styleNo);
    if (!bom) {
      throw new NotFoundException(`등록된 자재명세가 없습니다: ${styleNo}`);
    }

    const existingNames = new Set((bom.items ?? []).map((i) => i.material?.name));
    const added: string[] = [];
    const skipped: string[] = [];

    for (const label of LABEL_SET) {
      if (existingNames.has(label.itemName)) {
        skipped.push(label.itemName);
        continue;
      }

      let material = await this.itemRepository.findOne({ where: { name: label.itemName } });
      if (!material) {
        material = await this.itemRepository.save({
          code: `MAT-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
          name: label.itemName,
          type: ItemType.RAW_MATERIAL,
          unit: 'EA',
        });
      }

      await this.bomItemRepository.save({
        bom,
        material,
        category: label.category,
        colorCode: 'N/A',
        spec: 'N/A',
        consumption: label.consumption,
        requiredQty: 0,
        supplier: null,
        unitPrice: 0,
        remarks: 'N/A',
        composition: null,
        hsCode: null,
      });
      added.push(label.itemName);
    }

    const updatedBom = await this.findActiveByStyleNo(styleNo);
    return { bom: updatedBom!, added, skipped };
  }

  // PR-121: BOM이 2건 이상인 스타일을 나란히 비교할 수 있게 내려준다. 사람이 확인해야 하는 것(내용이 다르거나
  // 활성 BOM이 1건이 아닌 것)이 앞에, 완전히 같은 중복은 뒤에 온다.
  // PR-256: 겉감 혼용률 점검 목록(읽기 전용) — 겉감 행이 없거나(noRow)·겉감 혼용률이 비어 있거나(blank)·BOM 이 없는(noBom) 스타일.
  // SELECT 3개만 쓴다(스타일 번호·이름 / BOM id·활성·스타일 / 행의 BOM id·구분·혼용률 — 경량 컬럼, N+1 없음). 계산은 순수 함수.
  async findOuterFabricAudit(query: OuterFabricAuditQueryDto): Promise<OuterFabricAuditResponse> {
    const styleRows = await this.dataSource
      .getRepository(MasterStyle)
      .createQueryBuilder('s')
      .leftJoin('s.overview', 'o')
      .select(['s.styleNo', 'o.styleName'])
      .getRawMany<{ s_styleNo: string; o_styleName: string | null }>();
    const bomRows = await this.bomRepository
      .createQueryBuilder('b')
      .leftJoin('b.style', 'st')
      .select(['b.id', 'b.isActive', 'st.styleNo'])
      .getRawMany<{ b_id: number | string; b_isActive: unknown; st_styleNo: string | null }>();
    const itemRows = await this.bomItemRepository
      .createQueryBuilder('i')
      .leftJoin('i.bom', 'bm')
      .select(['i.category', 'i.composition', 'bm.id'])
      .getRawMany<{ i_category: unknown; i_composition: unknown; bm_id: number | string | null }>();

    return buildOuterFabricAudit(
      styleRows.map((r) => ({ styleNo: r.s_styleNo, styleName: r.o_styleName ?? null })),
      bomRows.filter((r) => r.st_styleNo != null).map((r) => ({ id: Number(r.b_id), styleNo: r.st_styleNo as string, isActive: r.b_isActive })),
      itemRows.filter((r) => r.bm_id != null).map((r) => ({ bomId: Number(r.bm_id), category: r.i_category, composition: r.i_composition })),
      { status: query.status, q: query.q, page: query.page, pageSize: query.pageSize },
    );
  }

  async findDuplicateReview(): Promise<DuplicateBomStyleView[]> {
    const light = await this.bomRepository.find({ relations: ['style'], order: { id: 'ASC' } });
    const idsByStyle = new Map<string, number[]>();
    for (const b of light) {
      const styleNo = b.style?.styleNo;
      if (!styleNo) continue;
      idsByStyle.set(styleNo, [...(idsByStyle.get(styleNo) ?? []), b.id]);
    }
    const dupStyles = [...idsByStyle.entries()].filter(([, ids]) => ids.length >= 2);
    if (dupStyles.length === 0) return [];

    const full = await this.bomRepository.find({
      where: { id: In(dupStyles.flatMap(([, ids]) => ids)) },
      relations: ['style', 'items', 'items.material'],
      order: { id: 'ASC' },
    });
    const fullById = new Map(full.map((b) => [b.id, b]));

    const views = dupStyles.map(([styleNo, ids]): DuplicateBomStyleView => {
      const boms = ids
        .map((id) => fullById.get(id)!)
        .filter(Boolean)
        .map((b): DuplicateBomView => {
          const items = [...(b.items ?? [])]
            .sort((x, y) => x.id - y.id)
            .map((i): DuplicateBomItemView => ({
              id: i.id,
              materialId: i.material?.id ?? null,
              materialCode: i.material?.code ?? '',
              materialName: i.material?.name ?? '',
              category: i.category ?? '',
              colorCode: i.colorCode ?? '',
              spec: i.spec ?? '',
              consumption: Number(i.consumption),
            }));
          return { id: b.id, bomNo: b.bomNo, version: b.version, isActive: b.isActive !== false, itemCount: items.length, items };
        });
      const activeCount = boms.filter((b) => b.isActive).length;
      const identical = areBomContentsIdentical(boms);
      const sameByName = identical || areBomContentsIdentical(boms.map((b) => ({ items: b.items.map((i) => ({ materialId: normalizeMaterialName(i.materialName), consumption: i.consumption })) })));
      return { styleNo, bomCount: boms.length, activeCount, identical, sameByName, needsReview: !sameByName || activeCount !== 1, boms };
    });

    return views.sort((a, b) => Number(b.needsReview) - Number(a.needsReview) || a.styleNo.localeCompare(b.styleNo));
  }

  // PR-121: 한 스타일에서 실제로 쓸 BOM을 하나로 정한다 — 선택한 BOM은 활성, 같은 스타일의 나머지는 비활성.
  // 한 트랜잭션으로 처리해 "활성이 0건/2건" 같은 중간 상태가 남지 않게 한다.
  async setActiveBom(styleNo: string, bomId: number): Promise<{ styleNo: string; activeBomId: number; boms: { id: number; isActive: boolean }[] }> {
    return this.bomRepository.manager.transaction(async (manager) => {
      const boms = await manager.find(Bom, { where: { style: { styleNo } }, order: { id: 'ASC' } });
      if (boms.length === 0) {
        throw new NotFoundException(`등록된 자재명세가 없습니다: ${styleNo}`);
      }
      if (!boms.some((b) => b.id === bomId)) {
        throw new BadRequestException(`BOM #${bomId}은(는) 스타일 ${styleNo}의 BOM이 아닙니다.`);
      }
      for (const b of boms) {
        const shouldBeActive = b.id === bomId;
        if (b.isActive !== shouldBeActive) await manager.update(Bom, b.id, { isActive: shouldBeActive });
      }
      return { styleNo, activeBomId: bomId, boms: boms.map((b) => ({ id: b.id, isActive: b.id === bomId })) };
    });
  }
}
