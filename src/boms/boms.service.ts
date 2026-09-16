import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bom } from './entities/bom.entity';
import { BomItem } from './entities/bom-item.entity';
import { UpdateBomItemDto } from './dto/update-bom-item.dto';
import { Item, ItemType } from '../items/entities/item.entity';
import { LABEL_SET } from './label-set.constants';

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

  // 같은 style에 Bom이 여러 개 생성될 수 있는 알려진 이슈가 있어(CHARTER.md 5.2절),
  // 재고 차감 로직(work-orders.service.ts)과 동일하게 id DESC로 최신 것만 반환한다.
  async findLatestByStyleNo(styleNo: string): Promise<Bom | null> {
    return this.bomRepository.findOne({
      where: { style: { styleNo } },
      relations: ['items', 'items.material', 'style'],
      order: { id: 'DESC' },
    });
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
    const bom = await this.findLatestByStyleNo(styleNo);
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

    const updatedBom = await this.findLatestByStyleNo(styleNo);
    return { bom: updatedBom!, added, skipped };
  }
}
