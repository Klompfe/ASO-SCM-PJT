import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bom } from './entities/bom.entity';
import { BomItem } from './entities/bom-item.entity';
import { UpdateBomItemDto } from './dto/update-bom-item.dto';

@Injectable()
export class BomsService {
  constructor(
    @InjectRepository(Bom)
    private readonly bomRepository: Repository<Bom>,
    @InjectRepository(BomItem)
    private readonly bomItemRepository: Repository<BomItem>,
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
}
