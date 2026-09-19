import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Bom } from './entities/bom.entity';
import { BomItem } from './entities/bom-item.entity';
import { UpdateBomItemDto } from './dto/update-bom-item.dto';
import { Item, ItemType } from '../items/entities/item.entity';
import { LABEL_SET } from './label-set.constants';
import { areBomContentsIdentical, normalizeMaterialName, pickActiveBom } from './utils/active-bom.util';

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
  constructor(
    @InjectRepository(Bom)
    private readonly bomRepository: Repository<Bom>,
    @InjectRepository(BomItem)
    private readonly bomItemRepository: Repository<BomItem>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
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
  async updateItem(id: number, dto: UpdateBomItemDto): Promise<BomItem> {
    const bomItem = await this.bomItemRepository.findOne({
      where: { id },
      relations: ['material'],
    });
    if (!bomItem) {
      throw new NotFoundException(`ID가 ${id}인 자재명세 항목을 찾을 수 없습니다.`);
    }

    if (dto.composition !== undefined) bomItem.composition = dto.composition;
    if (dto.hsCode !== undefined) bomItem.hsCode = dto.hsCode;

    return await this.bomItemRepository.save(bomItem);
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
