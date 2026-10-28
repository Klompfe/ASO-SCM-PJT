import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Not, In } from 'typeorm';
import { MasterStyle } from '../../styles/entities/master-style.entity';
import { StyleOverview, StyleOverviewStatus } from '../../styles/entities/style-overview.entity';
import { Bom } from '../../boms/entities/bom.entity';
import { pickActiveBom } from '../../boms/utils/active-bom.util';
import { BomItem } from '../../boms/entities/bom-item.entity';
import { ImportFile, ImportStatus } from '../../imports/entities/import-file.entity';
import { Item, ItemType } from '../../items/entities/item.entity';
import { PurchaseOrder, PurchaseOrderStatus } from '../../purchase-orders/entities/purchase-order.entity';
import { CommitMappingDto, CommitBomItemDto } from '../dto/commit-mapping.dto';
import { BomDiffRequestDto } from '../dto/bom-diff.dto';
import { BomReconcileRequestDto } from '../dto/bom-reconcile.dto';
import {
  classifyBomDiff,
  type BomDiffExistingRow,
  type BomDiffIncomingRow,
  type BomDiffRow,
  type BomSimilarPair,
} from '../utils/bom-diff.util';

// PR-132: commit()이 사용자에게 알려야 하는 두 종류의 사실을 문자열 패턴이 아니라 구조로 구분한다.
// - NEEDS_REVIEW: 병합 중 "자동 반영을 보류"했다 → 사용자가 확인하고 필요하면 수동으로 고쳐야 한다.
// - AUTO_APPLIED: 시스템이 값을 "자동으로 채웠다"(정보성) → 확인만 하면 된다.
export type CommitNoticeType = 'AUTO_APPLIED' | 'NEEDS_REVIEW';
export type CommitNoticeCode = 'FACTORY_MISMATCH' | 'BOM_ITEM_VALUE_DIFF' | 'LINING_COMPOSITION_DEFAULT' | 'CMT_PRICE_MISMATCH';

export interface CommitNotice {
  type: CommitNoticeType;
  code: CommitNoticeCode;
  message: string;
}

export interface CommitResult {
  success: boolean;
  styleNo: string;
  // PR-132: 구조화된 알림(화면이 유형별로 구분해 보여준다). 문구가 바뀌어도 type/code는 유지된다.
  notices: CommitNotice[];
  // PR-098: 병합 중 자동 반영을 보류한 항목 등을 사람이 읽을 수 있는 문자열로 담는다. notices.message와 같은 내용이며(단일 원천),
  // 수주 등록(작업지시서 업로드, SalesOrdersService.commitAnalysis)와 기존 호출부/테스트가 문자열 배열을 그대로 쓰므로 형태를 바꾸지 않는다.
  warnings: string[];
}

// BOM 자재 병합 키를 만들 때 빈 값을 기존 저장 관례(빈 값→'N/A')와 동일하게 정규화한다
// — 그래야 예전에 'N/A'로 저장된 행과 이번에 값을 안 보낸 행이 같은 자재로 매칭된다.
const normalizeKeyPart = (v?: string | null): string => (v && v.trim()) || 'N/A';

// PR-100: 안감(조바)류는 작업지시서 자체에 혼용률 표기가 없는 경우가 실무에서 흔하고,
// 그때는 관례상 "폴리에스터 100%"를 기본값으로 채운다(관세사 검토 완료된 실제
// hs_code_classifications.composition 데이터의 표기 관례 — "POLYESTER 100%" 형태를
// 그대로 따른다).
const LINING_DEFAULT_COMPOSITION = 'POLYESTER 100%';

// "안감/조바 계열" 판별 — 오탐 방지를 위해 category === '안감'이거나 itemName에
// "안감"/"조바"가 포함되는 경우로만 좁게 잡는다.
function isLiningItem(category?: string | null, itemName?: string | null): boolean {
  if (category === '안감') return true;
  const name = itemName ?? '';
  return name.includes('안감') || name.includes('조바');
}

// PR-198: bom-diff 응답 — hasExistingBom=false면 rows/similarPairs는 생략되고(화면은
// 비교 없이 바로 기존 저장 경로로 진행), true면 둘 다 채워진다.
export interface BomDiffResponse {
  hasExistingBom: boolean;
  rows?: BomDiffRow[];
  similarPairs?: BomSimilarPair[];
}

export interface BomReconcileResult {
  styleNo: string;
  applied: { overwritten: number; added: number; removed: number; replaced: number };
  remainingBomItemCount: number;
  warnings: string[];
}

@Injectable()
export class MappingCommitService {
  private readonly logger = new Logger(MappingCommitService.name);

  constructor(
    private readonly dataSource: DataSource,
  ) {}

  async checkExists(styleNo: string): Promise<{ exists: boolean }> {
    const style = await this.dataSource.manager.findOne(MasterStyle, { where: { styleNo } });
    return { exists: !!style };
  }

  // PR-098: 같은 styleNo로 재커밋될 때 기존 StyleOverview/Bom을 통째로 교체·중복
  // 생성하던 것을 "병합"으로 바꿨다 — 실무에서 같은 스타일의 작업지시서가 시간차를
  // 두고 여러 번 들어오고(예: 기존 BK 컬러는 그대로 두고 신규 CR/BR 컬러만 추가),
  // 그때마다 기존 값을 조용히 지워버리면 안 되기 때문이다. StyleOverview는 필드
  // 단위로(비어있으면 기존 유지, 있으면 덮어쓰되 factory만 예외로 경고만 남김) 갱신하고,
  // Bom은 해당 스타일의 최신 것을 재사용하며, BomItem은 (자재명, 색상, 규격) 키가
  // 일치하면 건드리지 않고(수량/요척 차이는 warnings에만 기록) 없으면 새로 추가한다.
  // 기존 BomItem을 지우는 동작은 이 메서드의 책임이 아니다(별도 명시적 삭제로만 가능).
  async commit(payload: CommitMappingDto): Promise<CommitResult> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    const notices: CommitNotice[] = [];

    try {
      const { styleNo, overviewData, bomItems } = payload;

      // 1. Import Log
      await queryRunner.manager.save(ImportFile, {
        fileName: `${styleNo}.csv`,
        styleNo,
        status: ImportStatus.SUCCESS,
      });

      // 2 & 3. MasterStyle & Overview — 기존이 있으면 필드 단위 병합, 없으면 새로 생성.
      let style = await queryRunner.manager.findOne(MasterStyle, { where: { styleNo }, relations: ['overview'] });
      if (!style) {
        style = queryRunner.manager.create(MasterStyle, { styleNo });
      }

      if (style.overview) {
        this.mergeOverview(style.overview, overviewData, notices);
      } else {
        style.overview = queryRunner.manager.create(StyleOverview, {
          factory: overviewData.factory,
          totalQty: overviewData.totalQty,
          buyer: overviewData.buyer,
          firstShipDate: overviewData.shipDate ? new Date(overviewData.shipDate) : null,
          status: StyleOverviewStatus.PENDING_APPROVAL,
          // Excel 매핑 커밋 경로는 아래 필드를 보내지 않아 그대로 null로 남는다.
          styleName: overviewData.styleName ?? null,
          brand: overviewData.brand ?? null,
          itemType: overviewData.itemType ?? null,
          productionType: overviewData.productionType ?? null,
          targetRdd: overviewData.targetRdd ? new Date(overviewData.targetRdd) : null,
          // PR-168: 미도 전용 수기 CMT단가 — 사람이 확인한 값만 들어온다(위 DTO 주석 참고).
          cmtPrice: overviewData.cmtPrice ?? null,
          style,
        });
      }
      await queryRunner.manager.save(style);

      // 4. Bom — 해당 스타일에 이미 Bom이 있으면 pickActiveBom 규칙(활성 BOM 중 최신)으로 골라 재사용하고, 없을 때만
      // 새로 만든다. 사용자가 "BOM 중복 검토"에서 고른 BOM에 새 항목이 병합되도록 다른 화면과 같은 규칙을 쓴다(PR-123).
      const existingBoms = await queryRunner.manager.find(Bom, {
        where: { style: { styleNo } },
        relations: ['items', 'items.material'],
      });
      let bom = pickActiveBom(existingBoms);
      if (!bom) {
        bom = queryRunner.manager.create(Bom, {
          bomNo: `BOM-${styleNo}-001`,
          version: 'V1',
          style,
        });
        await queryRunner.manager.save(bom);
        bom.items = [];
      }

      for (const item of bomItems) {
        // 5. Register Material if not exists
        let material = await queryRunner.manager.findOne(Item, { where: { name: item.itemName } });
        if (!material) {
          material = await queryRunner.manager.save(Item, {
            code: `MAT-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
            name: item.itemName,
            type: ItemType.RAW_MATERIAL,
            unit: 'EA'
          });
        }

        const colorCode = normalizeKeyPart(item.colorCode);
        const spec = normalizeKeyPart(item.spec);
        const existingBomItem = (bom.items ?? []).find(
          (bi) => bi.material?.name === item.itemName && bi.colorCode === colorCode && bi.spec === spec,
        );

        if (existingBomItem) {
          // 이미 등록된 (자재명, 색상, 규격) 조합 — 건드리지 않는다. 수량/요척만 달라도
          // 실수로 잘못된 값으로 갈아엎지 않도록 자동 반영하지 않고 차이를 기록만 한다.
          const newConsumption = item.consumption ?? 0;
          const newRequiredQty = item.requiredQty ?? 0;
          if (
            Number(existingBomItem.consumption) !== Number(newConsumption) ||
            Number(existingBomItem.requiredQty) !== Number(newRequiredQty)
          ) {
            notices.push({
              type: 'NEEDS_REVIEW',
              code: 'BOM_ITEM_VALUE_DIFF',
              message:
                `${item.itemName}(${colorCode}/${spec}) 기존 값(요척 ${existingBomItem.consumption}, 소요량 ${existingBomItem.requiredQty}) ` +
                `→ 새 값(요척 ${newConsumption}, 소요량 ${newRequiredQty}) — 자동 반영하지 않음, 확인 후 수동 변경 필요`,
            });
          }
          continue;
        }

        // PR-100: 안감(조바)류인데 혼용률이 비어있으면 기본값을 채운다 — 조용히
        // 채우지 않고 warnings에 남겨 사용자가 알 수 있게 한다.
        let composition = item.composition ?? null;
        if (!composition && isLiningItem(item.category, item.itemName)) {
          composition = LINING_DEFAULT_COMPOSITION;
          notices.push({
            type: 'AUTO_APPLIED',
            code: 'LINING_COMPOSITION_DEFAULT',
            message: `안감 항목 '${item.itemName}' 혼용률 미기재 — 기본값 ${LINING_DEFAULT_COMPOSITION} 자동 적용`,
          });
        }

        const savedBomItem = await queryRunner.manager.save(BomItem, {
          bom,
          material,
          category: item.category || 'GENERAL',
          colorCode,
          spec,
          consumption: item.consumption ?? 0,
          requiredQty: item.requiredQty ?? 0,
          // PR-098: 공급처는 작업지시서 문서 자체에는 없는 정보(실제 발주 단계에서
          // 결정)라 AI가 추정해서 채워 보내도 'N/A' 같은 문자열로 확정 저장하지 않는다
          // — "진짜로 빈 값"을 구분할 수 있어야 화면에서 "미정"으로 정확히 표시된다.
          supplier: item.supplier || null,
          unitPrice: item.unitPrice ?? 0,
          remarks: item.remarks || 'N/A',
          composition,
          hsCode: item.hsCode ?? null,
          // PR-175: 사람이 검토 화면에서 확인한 최종 실/테이프 종류만 반영한다(AI
          // 후보를 그대로 저장하지 않음 — commitAnalysis 쪽에서 이미 사람이 확인한
          // 값만 여기로 넘어온다).
          threadType: (item.threadType as any) ?? null,
          tapeType: (item.tapeType as any) ?? null,
        });
        bom.items = [...(bom.items ?? []), savedBomItem];
      }

      await queryRunner.commitTransaction();
      return { success: true, styleNo, notices, warnings: notices.map((n) => n.message) };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException(err);
    } finally {
      await queryRunner.release();
    }
  }

  // PR-198: 엑셀 업로드 저장 전 "기존 BOM과 비교"(읽기 전용, 저장 안 함). 이미 활성 BOM이
  // 있는 스타일에서만 비교 화면을 보여줄 필요가 있다 — 없으면 그냥 commit()이 새로 만든다.
  async diff(payload: BomDiffRequestDto): Promise<BomDiffResponse> {
    const { styleNo, bomItems } = payload;
    const existingBoms = await this.dataSource.manager.find(Bom, {
      where: { style: { styleNo } },
      relations: ['items', 'items.material'],
    });
    const bom = pickActiveBom(existingBoms);
    if (!bom || (bom.items ?? []).length === 0) {
      return { hasExistingBom: false };
    }

    const materialIds = [...new Set((bom.items ?? []).map((i) => i.material?.id).filter((v): v is number => v != null))];
    const linkedCounts = new Map<number, number>();
    if (materialIds.length > 0) {
      const pos = await this.dataSource.manager.find(PurchaseOrder, {
        where: { styleNo, itemId: In(materialIds), status: Not(PurchaseOrderStatus.CANCELLED) },
      });
      for (const po of pos) {
        linkedCounts.set(po.itemId, (linkedCounts.get(po.itemId) ?? 0) + 1);
      }
    }

    const existingRows: BomDiffExistingRow[] = (bom.items ?? []).map((i) => ({
      bomItemId: i.id,
      itemName: i.material?.name ?? '',
      category: i.category ?? null,
      colorCode: i.colorCode ?? null,
      spec: i.spec ?? null,
      consumption: Number(i.consumption),
      linkedPoCount: (i.material?.id != null ? linkedCounts.get(i.material.id) : undefined) ?? 0,
    }));
    const incomingRows: BomDiffIncomingRow[] = bomItems.map((item) => ({
      itemName: item.itemName,
      category: item.category ?? null,
      colorCode: item.colorCode ?? null,
      spec: item.spec ?? null,
      consumption: item.consumption ?? null,
    }));

    const { rows, similarPairs } = classifyBomDiff(existingRows, incomingRows);
    return { hasExistingBom: true, rows, similarPairs };
  }

  // PR-198: bom-diff 비교 화면에서 사람이 행별로 고른 동작을 적용한다(all-or-nothing —
  // 하나라도 이 스타일 BOM 소속이 아닌 bomItemId가 섞이면 전체 롤백). commit()의
  // "같은 (자재명,색상,규격)이면 절대 덮어쓰지 않는다" 규칙과 달리, 여기서는 사람이
  // 화면에서 명시적으로 고른 행만 실제로 값을 바꾼다.
  async reconcile(payload: BomReconcileRequestDto): Promise<BomReconcileResult> {
    const { styleNo, actions } = payload;
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    const warnings: string[] = [];
    const applied = { overwritten: 0, added: 0, removed: 0, replaced: 0 };

    try {
      const boms = await queryRunner.manager.find(Bom, {
        where: { style: { styleNo } },
        relations: ['items', 'items.material', 'style', 'style.overview'],
      });
      const bom = pickActiveBom(boms);
      if (!bom) {
        throw new NotFoundException(`등록된 자재명세가 없습니다: ${styleNo}`);
      }

      const bomItemIds = new Set((bom.items ?? []).map((i) => i.id));
      for (const action of actions) {
        if ((action.type === 'OVERWRITE' || action.type === 'REMOVE' || action.type === 'REPLACE') && !action.bomItemId) {
          throw new BadRequestException(`${action.type} 동작에는 bomItemId가 필요합니다.`);
        }
        if (action.bomItemId != null && !bomItemIds.has(action.bomItemId)) {
          throw new BadRequestException(`BOM 행 #${action.bomItemId}은(는) 스타일 ${styleNo}의 자재명세가 아닙니다.`);
        }
        if ((action.type === 'OVERWRITE' || action.type === 'ADD' || action.type === 'REPLACE') && !action.newItem) {
          throw new BadRequestException(`${action.type} 동작에는 newItem이 필요합니다.`);
        }
      }

      const totalQty = Number(bom.style?.overview?.totalQty);
      const hasTotalQty = Number.isFinite(totalQty) && totalQty > 0;
      let items = [...(bom.items ?? [])];

      const findOrCreateMaterial = async (itemName: string): Promise<Item> => {
        let material = await queryRunner.manager.findOne(Item, { where: { name: itemName } });
        if (!material) {
          material = await queryRunner.manager.save(Item, {
            code: `MAT-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
            name: itemName,
            type: ItemType.RAW_MATERIAL,
            unit: 'EA',
          });
        }
        return material;
      };

      const applyNewItemValues = (bomItem: BomItem, newItem: CommitBomItemDto) => {
        if (newItem.category !== undefined) bomItem.category = newItem.category || 'GENERAL';
        if (newItem.colorCode !== undefined) bomItem.colorCode = normalizeKeyPart(newItem.colorCode);
        if (newItem.spec !== undefined) bomItem.spec = normalizeKeyPart(newItem.spec);
        if (newItem.supplier !== undefined) bomItem.supplier = newItem.supplier || null;
        if (newItem.unitPrice !== undefined) bomItem.unitPrice = newItem.unitPrice ?? 0;
        if (newItem.remarks !== undefined) bomItem.remarks = newItem.remarks || 'N/A';
        if (newItem.composition !== undefined) bomItem.composition = newItem.composition ?? null;
        if (newItem.hsCode !== undefined) bomItem.hsCode = newItem.hsCode ?? null;
        if (newItem.threadType !== undefined) bomItem.threadType = (newItem.threadType as any) ?? null;
        if (newItem.tapeType !== undefined) bomItem.tapeType = (newItem.tapeType as any) ?? null;
        if (newItem.consumption !== undefined) {
          const consumption = newItem.consumption ?? 0;
          bomItem.consumption = consumption;
          bomItem.requiredQty = hasTotalQty
            ? Math.round(consumption * totalQty * 10000) / 10000
            : (newItem.requiredQty ?? bomItem.requiredQty);
        }
      };

      for (const action of actions) {
        if (action.type === 'OVERWRITE') {
          const bomItem = items.find((i) => i.id === action.bomItemId)!;
          const before = { consumption: Number(bomItem.consumption), spec: bomItem.spec, colorCode: bomItem.colorCode };
          applyNewItemValues(bomItem, action.newItem!);
          const saved = await queryRunner.manager.save(BomItem, bomItem);
          items = items.map((i) => (i.id === saved.id ? saved : i));
          this.logger.log(`BomItem #${saved.id} 덮어쓰기: ${JSON.stringify(before)} → consumption=${saved.consumption}, spec=${saved.spec}, colorCode=${saved.colorCode}`);
          applied.overwritten++;
        } else if (action.type === 'ADD') {
          const newItem = action.newItem!;
          const material = await findOrCreateMaterial(newItem.itemName);
          const consumption = newItem.consumption ?? 0;
          const requiredQty = hasTotalQty ? Math.round(consumption * totalQty * 10000) / 10000 : (newItem.requiredQty ?? 0);
          const saved = await queryRunner.manager.save(BomItem, {
            bom,
            material,
            category: newItem.category || 'GENERAL',
            colorCode: normalizeKeyPart(newItem.colorCode),
            spec: normalizeKeyPart(newItem.spec),
            consumption,
            requiredQty,
            supplier: newItem.supplier || null,
            unitPrice: newItem.unitPrice ?? 0,
            remarks: newItem.remarks || 'N/A',
            composition: newItem.composition ?? null,
            hsCode: newItem.hsCode ?? null,
            threadType: (newItem.threadType as any) ?? null,
            tapeType: (newItem.tapeType as any) ?? null,
          });
          items.push(saved);
          this.logger.log(`BomItem #${saved.id} 추가(엑셀 기준): ${newItem.itemName}`);
          applied.added++;
        } else if (action.type === 'REMOVE') {
          const bomItem = items.find((i) => i.id === action.bomItemId)!;
          const materialId = bomItem.material?.id;
          if (materialId != null) {
            const linkedCount = await queryRunner.manager.count(PurchaseOrder, {
              where: { styleNo, itemId: materialId, status: Not(PurchaseOrderStatus.CANCELLED) },
            });
            if (linkedCount > 0) {
              warnings.push(`BomItem #${bomItem.id}(${bomItem.material?.name ?? ''}) 제거 — 연결된 발주(취소 제외) ${linkedCount}건이 있습니다.`);
            }
          }
          await queryRunner.manager.delete(BomItem, bomItem.id);
          items = items.filter((i) => i.id !== bomItem.id);
          this.logger.log(`BomItem #${bomItem.id} 제거(엑셀 기준 — 자재 마스터/발주는 유지)`);
          applied.removed++;
        } else if (action.type === 'REPLACE') {
          const bomItem = items.find((i) => i.id === action.bomItemId)!;
          const newItem = action.newItem!;
          const beforeMaterialId = bomItem.material?.id ?? null;
          bomItem.material = await findOrCreateMaterial(newItem.itemName);
          applyNewItemValues(bomItem, newItem);
          const saved = await queryRunner.manager.save(BomItem, bomItem);
          items = items.map((i) => (i.id === saved.id ? saved : i));
          this.logger.log(`BomItem #${saved.id} 자재 교체: material ${beforeMaterialId} → ${saved.material?.id}(${newItem.itemName})`);
          applied.replaced++;
        }
      }

      await queryRunner.commitTransaction();
      return { styleNo, applied, remainingBomItemCount: items.length, warnings };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      if (err instanceof BadRequestException || err instanceof NotFoundException) throw err;
      throw new InternalServerErrorException(err);
    } finally {
      await queryRunner.release();
    }
  }

  // 기존 StyleOverview를 새 값으로 필드 단위 병합한다. factory는 예외: 기존 값이 이미
  // 있으면 새 값이 달라도 자동으로 덮어쓰지 않고 notices(NEEDS_REVIEW)에만 기록한다(관세사/영업
  // 검토 없이 "국가 단위 기본값" 위에 "구체적 공장명"이 실수로 덮어써지는 걸 막기 위함).
  // 나머지 필드는 이번 요청 값이 있으면(null/undefined가 아니면) 덮어쓰고, 없으면
  // 기존 값을 그대로 둔다.
  private mergeOverview(
    overview: StyleOverview,
    overviewData: CommitMappingDto['overviewData'],
    notices: CommitNotice[],
  ): void {
    if (overviewData.factory) {
      if (overview.factory && overview.factory !== overviewData.factory) {
        notices.push({
          type: 'NEEDS_REVIEW',
          code: 'FACTORY_MISMATCH',
          message: `기존 factory 값 '${overview.factory}' → 새 값 '${overviewData.factory}' — 자동 반영하지 않음, 확인 후 수동 변경 필요`,
        });
      } else if (!overview.factory) {
        overview.factory = overviewData.factory;
      }
    }

    // PR-211: MATERIAL LIST의 QTY 칸이 비어 있으면 파서가 0으로 만든다
    // (section-parser.util.ts:40-41, 실측 118/118 시트가 이 칸이 비어 있어 항상 0).
    // `!= null`은 0을 "값이 있다"로 취급해 기존 총수량을 0으로 덮어써 버리는 사고가
    // 있었다(PILOT-13) — 들어온 값이 유한한 양수일 때만 갱신한다. 0/NaN/null/undefined/
    // 음수는 "못 읽음"으로 보고 기존 값을 그대로 둔다.
    if (Number.isFinite(overviewData.totalQty) && overviewData.totalQty > 0) {
      overview.totalQty = overviewData.totalQty;
    }
    if (overviewData.buyer) overview.buyer = overviewData.buyer;
    if (overviewData.shipDate) overview.firstShipDate = new Date(overviewData.shipDate);
    if (overviewData.styleName != null) overview.styleName = overviewData.styleName;
    if (overviewData.brand != null) overview.brand = overviewData.brand;
    if (overviewData.itemType != null) overview.itemType = overviewData.itemType;
    if (overviewData.productionType != null) overview.productionType = overviewData.productionType;
    if (overviewData.targetRdd) overview.targetRdd = new Date(overviewData.targetRdd);

    // PR-168: 미도 전용 수기 CMT단가 — factory와 같은 이유로 재커밋 시 기존 값을
    // 조용히 덮어쓰지 않는다(사람이 한 번 확인해 저장한 단가를 재분석 결과로 실수로
    // 갈아엎지 않기 위함). 값이 다르면 NEEDS_REVIEW로만 기록하고, 기존 값이 아직
    // 없을 때만 채운다.
    if (overviewData.cmtPrice != null) {
      if (overview.cmtPrice != null && Number(overview.cmtPrice) !== overviewData.cmtPrice) {
        notices.push({
          type: 'NEEDS_REVIEW',
          code: 'CMT_PRICE_MISMATCH',
          message: `기존 CMT단가 '${overview.cmtPrice}' → 새 값 '${overviewData.cmtPrice}' — 자동 반영하지 않음, 확인 후 수동 변경 필요`,
        });
      } else if (overview.cmtPrice == null) {
        overview.cmtPrice = overviewData.cmtPrice;
      }
    }
  }
}
