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
    const existing = await this.repository.findOne({ where: { id: SINGLETON_ID } });
    const row = existing
      ? Object.assign(existing, dto)
      : this.repository.create({ id: SINGLETON_ID, ...dto });
    return this.repository.save(row);
  }
}
