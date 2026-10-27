import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExportShipmentDefaults } from './entities/export-shipment-defaults.entity';
import { UpdateExportShipmentDefaultsDto } from './dto/update-export-shipment-defaults.dto';

const SINGLETON_ID = 1;

@Injectable()
export class ExportShipmentDefaultsService {
  constructor(
    @InjectRepository(ExportShipmentDefaults)
    private readonly repository: Repository<ExportShipmentDefaults>,
  ) {}

  // 싱글턴 행이 아직 한 번도 저장된 적 없으면 null을 그대로 반환한다(에러 아님) —
  // export-shipments.service.ts의 generate()와 프론트 둘 다 "기본값 미설정"을
  // null로 다루면 되므로 여기서 빈 행을 미리 만들어 둘 필요가 없다.
  async find(): Promise<ExportShipmentDefaults | null> {
    return this.repository.findOne({ where: { id: SINGLETON_ID } });
  }

  async update(dto: UpdateExportShipmentDefaultsDto): Promise<ExportShipmentDefaults> {
    // PR-193: carrier는 더 이상 기본값으로 저장하지 않는다(선적 건마다 바뀌는 값이라
    // 건별 입력 전용으로 바뀜) — 구버전 화면이 여전히 carrier를 보내더라도 조용히
    // 무시해, 이미 저장돼 있던 값이 바뀌지도 않고 컬럼이 지워지지도 않는다.
    const { carrier: _ignoredCarrier, ...rest } = dto;
    const existing = await this.repository.findOne({ where: { id: SINGLETON_ID } });
    const row = existing
      ? Object.assign(existing, rest)
      : this.repository.create({ id: SINGLETON_ID, ...rest });
    return this.repository.save(row);
  }
}
