import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { MasterStyle } from '../../styles/entities/master-style.entity';
import { StyleOverview, StyleOverviewStatus } from '../../styles/entities/style-overview.entity';
import { Bom } from '../../boms/entities/bom.entity';
import { pickActiveBom } from '../../boms/utils/active-bom.util';
import { BomItem } from '../../boms/entities/bom-item.entity';
import { ImportFile, ImportStatus } from '../../imports/entities/import-file.entity';
import { Item, ItemType } from '../../items/entities/item.entity';
import { CommitMappingDto } from '../dto/commit-mapping.dto';

export interface CommitResult {
  success: boolean;
  styleNo: string;
  // PR-098: 병합 중 자동 반영을 보류한 항목(기존 factory와 충돌, 기존 BomItem과 수량/
  // 요척이 다름 등)을 호출자(작업지시서 업로드 화면, Excel 매핑 화면)가 사용자에게
  // 보여줄 수 있도록 담는다.
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

@Injectable()
export class MappingCommitService {
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
    const warnings: string[] = [];

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
        this.mergeOverview(style.overview, overviewData, warnings);
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
            warnings.push(
              `${item.itemName}(${colorCode}/${spec}) 기존 값(요척 ${existingBomItem.consumption}, 소요량 ${existingBomItem.requiredQty}) ` +
                `→ 새 값(요척 ${newConsumption}, 소요량 ${newRequiredQty}) — 자동 반영하지 않음, 확인 후 수동 변경 필요`,
            );
          }
          continue;
        }

        // PR-100: 안감(조바)류인데 혼용률이 비어있으면 기본값을 채운다 — 조용히
        // 채우지 않고 warnings에 남겨 사용자가 알 수 있게 한다.
        let composition = item.composition ?? null;
        if (!composition && isLiningItem(item.category, item.itemName)) {
          composition = LINING_DEFAULT_COMPOSITION;
          warnings.push(
            `안감 항목 '${item.itemName}' 혼용률 미기재 — 기본값 ${LINING_DEFAULT_COMPOSITION} 자동 적용`,
          );
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
        });
        bom.items = [...(bom.items ?? []), savedBomItem];
      }

      await queryRunner.commitTransaction();
      return { success: true, styleNo, warnings };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException(err);
    } finally {
      await queryRunner.release();
    }
  }

  // 기존 StyleOverview를 새 값으로 필드 단위 병합한다. factory는 예외: 기존 값이 이미
  // 있으면 새 값이 달라도 자동으로 덮어쓰지 않고 warnings에만 기록한다(관세사/영업
  // 검토 없이 "국가 단위 기본값" 위에 "구체적 공장명"이 실수로 덮어써지는 걸 막기 위함).
  // 나머지 필드는 이번 요청 값이 있으면(null/undefined가 아니면) 덮어쓰고, 없으면
  // 기존 값을 그대로 둔다.
  private mergeOverview(
    overview: StyleOverview,
    overviewData: CommitMappingDto['overviewData'],
    warnings: string[],
  ): void {
    if (overviewData.factory) {
      if (overview.factory && overview.factory !== overviewData.factory) {
        warnings.push(
          `기존 factory 값 '${overview.factory}' → 새 값 '${overviewData.factory}' — 자동 반영하지 않음, 확인 후 수동 변경 필요`,
        );
      } else if (!overview.factory) {
        overview.factory = overviewData.factory;
      }
    }

    if (overviewData.totalQty != null) overview.totalQty = overviewData.totalQty;
    if (overviewData.buyer) overview.buyer = overviewData.buyer;
    if (overviewData.shipDate) overview.firstShipDate = new Date(overviewData.shipDate);
    if (overviewData.styleName != null) overview.styleName = overviewData.styleName;
    if (overviewData.brand != null) overview.brand = overviewData.brand;
    if (overviewData.itemType != null) overview.itemType = overviewData.itemType;
    if (overviewData.productionType != null) overview.productionType = overviewData.productionType;
    if (overviewData.targetRdd) overview.targetRdd = new Date(overviewData.targetRdd);
  }
}
