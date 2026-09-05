import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bom } from './entities/bom.entity';

@Injectable()
export class BomsService {
  constructor(
    @InjectRepository(Bom)
    private readonly bomRepository: Repository<Bom>,
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
}
