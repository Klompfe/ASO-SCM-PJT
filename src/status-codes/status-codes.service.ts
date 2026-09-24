import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StatusCode } from './entities/status-code.entity';
import { CreateStatusCodeDto } from './dto/create-status-code.dto';
import { UpdateStatusCodeDto } from './dto/update-status-code.dto';
import { WorkOrder } from '../work-orders/entities/work-order.entity';

// PR-140: 도메인별로 "이 코드가 실제 데이터에서 쓰이고 있는지" 세는 함수. 아직 이 마스터
// 테이블로 전환되지 않은 도메인(Contract/PurchaseOrder/Shipment 등, PR-141 이후 예정)은
// 여기 등록돼 있지 않으면 "사용 여부 확인 불가 = 0건으로 간주"해 삭제를 허용한다 — 각 도메인이
// 이 테이블로 전환되는 시점에 자기 checker를 이 맵에 추가해야 한다(재사용 지점).
type UsageChecker = (dataSource: DataSource, code: string) => Promise<number>;
const USAGE_CHECKERS: Record<string, UsageChecker> = {
  WORK_ORDER: (dataSource, code) => dataSource.getRepository(WorkOrder).count({ where: { status: code as any } }),
};

@Injectable()
export class StatusCodesService {
  constructor(
    @InjectRepository(StatusCode)
    private readonly repository: Repository<StatusCode>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(domain: string, includeInactive = false): Promise<StatusCode[]> {
    return this.repository.find({
      where: includeInactive ? { domain } : { domain, isActive: true },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
  }

  async create(dto: CreateStatusCodeDto): Promise<StatusCode> {
    const existing = await this.repository.findOne({ where: { domain: dto.domain, code: dto.code } });
    if (existing) {
      throw new BadRequestException(`이미 등록된 상태코드입니다: ${dto.domain}/${dto.code}`);
    }
    const entity = this.repository.create({
      domain: dto.domain,
      code: dto.code,
      label: dto.label,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });
    return this.repository.save(entity);
  }

  private async findOneOrFail(id: number): Promise<StatusCode> {
    const row = await this.repository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException(`ID가 ${id}인 상태코드를 찾을 수 없습니다.`);
    }
    return row;
  }

  async update(id: number, dto: UpdateStatusCodeDto): Promise<StatusCode> {
    const row = await this.findOneOrFail(id);
    if (dto.label !== undefined) row.label = dto.label;
    if (dto.sortOrder !== undefined) row.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) row.isActive = dto.isActive;
    return this.repository.save(row);
  }

  // 사용 중인 상태코드는 삭제를 막는다(그 값을 쓰는 데이터가 "존재하지 않는 상태"를 가리키게
  // 되는 것을 방지) — 대신 isActive=false로 비활성화해 신규 선택만 막는 것을 권장한다.
  async remove(id: number): Promise<void> {
    const row = await this.findOneOrFail(id);
    const checker = USAGE_CHECKERS[row.domain];
    if (checker) {
      const usageCount = await checker(this.dataSource, row.code);
      if (usageCount > 0) {
        throw new ConflictException(
          `이 상태코드는 이미 ${usageCount}건에서 사용 중이라 삭제할 수 없습니다. 대신 "비활성화"로 전환해 주세요.`,
        );
      }
    }
    await this.repository.remove(row);
  }
}
