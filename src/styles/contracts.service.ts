import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Contract, ContractStatus } from './entities/contract.entity';
import { MasterStyle } from './entities/master-style.entity';
import { ProductionType } from './entities/style-overview.entity';
import { IssueContractDto } from './dto/issue-contract.dto';
import { SalesContractPricesService } from '../sales-contract-prices/sales-contract-prices.service';

@Injectable()
export class ContractsService {
  constructor(
    @InjectRepository(Contract)
    private readonly contractRepository: Repository<Contract>,
    @InjectRepository(MasterStyle)
    private readonly masterStyleRepository: Repository<MasterStyle>,
    private readonly salesContractPricesService: SalesContractPricesService,
    private readonly dataSource: DataSource,
  ) {}

  // PR-166 이전에는 수동 발행(여기)이 StyleOverview 값을 전혀 복사하지 않아,
  // 같은 스타일이라도 수주 등록(AI 분석, sales-orders.service.ts commitAnalysis)
  // 경로로 만들어진 계약과 달리 공장/바이어/단가 등이 전부 null이었다 — 두 경로의
  // 결과물이 일관되도록 수동 발행도 그 시점 StyleOverview 스냅샷을 그대로 복사한다.
  // CMT 계약이고 cmtPrice가 아직 없으면 CMT매입단가 표준가격을 추가로 조회해 채운다
  // (정확매칭/브랜드품종평균이면 자동 입력, 그래도 못 찾으면 null로 두고 근거만 남겨
  // 승인자가 수동으로 입력하게 한다 — 승인 자체를 막지는 않는다).
  async issue(dto: IssueContractDto): Promise<Contract> {
    const style = await this.masterStyleRepository.findOne({ where: { styleNo: dto.styleNo }, relations: ['overview'] });
    if (!style) {
      throw new NotFoundException(`존재하지 않는 스타일입니다: ${dto.styleNo}`);
    }
    const overview = style.overview;

    let cmtPrice = overview?.cmtPrice ?? null;
    let cmtPriceConfidence: Contract['cmtPriceConfidence'] = null;
    let cmtPriceNote: string | null = null;

    if (overview?.productionType === ProductionType.CMT && cmtPrice == null) {
      const resolved = await this.salesContractPricesService.resolve(dto.styleNo, overview.itemType ?? undefined);
      cmtPriceConfidence = resolved.confidence;
      cmtPriceNote = resolved.note;
      if (resolved.price != null) {
        cmtPrice = resolved.price;
      }
    }

    const contract = this.contractRepository.create({
      styleNo: dto.styleNo,
      notes: dto.notes ?? null,
      totalQty: overview?.totalQty ?? null,
      targetRdd: overview?.targetRdd ?? null,
      factory: overview?.factory ?? null,
      buyer: overview?.buyer ?? null,
      productionType: overview?.productionType ?? null,
      cmtPrice,
      fobPrice: overview?.fobPrice ?? null,
      cmtPriceConfidence,
      cmtPriceNote,
    });
    return this.contractRepository.save(contract);
  }

  async findByStyleNo(styleNo: string): Promise<Contract[]> {
    return this.contractRepository.find({
      where: { styleNo },
      order: { issuedAt: 'DESC' },
    });
  }

  // 승인은 "이 스타일의 활성 계약은 항상 하나"를 보장해야 하므로, 기존 APPROVED 건을
  // SUPERSEDED로 내리는 것과 이 건을 APPROVED로 올리는 것을 한 트랜잭션으로 묶는다.
  async approve(id: number, approvedByUserId: number): Promise<Contract> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const contract = await queryRunner.manager.findOne(Contract, { where: { id } });
      if (!contract) {
        throw new NotFoundException(`ID가 ${id}인 계약을 찾을 수 없습니다.`);
      }
      if (contract.status !== ContractStatus.PENDING_APPROVAL) {
        throw new BadRequestException(
          `이미 처리된 계약입니다(현재 상태: ${contract.status}). 승인 대기 상태만 승인할 수 있습니다.`,
        );
      }

      const existingApproved = await queryRunner.manager.findOne(Contract, {
        where: { styleNo: contract.styleNo, status: ContractStatus.APPROVED },
      });
      if (existingApproved) {
        existingApproved.status = ContractStatus.SUPERSEDED;
        await queryRunner.manager.save(existingApproved);
      }

      contract.status = ContractStatus.APPROVED;
      contract.approvedByUserId = approvedByUserId;
      contract.approvedAt = new Date();
      const saved = await queryRunner.manager.save(contract);

      await queryRunner.commitTransaction();
      return saved;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // PR-090: 일괄승인. ids가 있으면 그 목록만, 없으면 현재 PENDING_APPROVAL 전체를
  // 대상으로 한다. 새 로직을 따로 만들지 않고 기존 approve()를 건별로 그대로 재사용해
  // "같은 styleNo의 기존 APPROVED를 SUPERSEDED로 내린다"는 불변식이 깨지지 않게 한다.
  // 동시성을 위해 병렬(Promise.all)로 돌리면 같은 styleNo의 계약 두 건이 배치에 함께
  // 들어있을 때 경쟁이 생길 수 있어 순차 처리한다.
  async bulkApprove(
    ids: number[] | undefined,
    approvedByUserId: number,
  ): Promise<{ approvedCount: number; failed: { id: number; reason: string }[] }> {
    const targetIds =
      ids && ids.length > 0
        ? ids
        : (
            await this.contractRepository.find({ where: { status: ContractStatus.PENDING_APPROVAL } })
          ).map((c) => c.id);

    let approvedCount = 0;
    const failed: { id: number; reason: string }[] = [];

    for (const id of targetIds) {
      try {
        await this.approve(id, approvedByUserId);
        approvedCount++;
      } catch (err) {
        failed.push({ id, reason: err instanceof Error ? err.message : '알 수 없는 오류' });
      }
    }

    return { approvedCount, failed };
  }

  async reject(id: number): Promise<Contract> {
    const contract = await this.contractRepository.findOne({ where: { id } });
    if (!contract) {
      throw new NotFoundException(`ID가 ${id}인 계약을 찾을 수 없습니다.`);
    }
    if (contract.status !== ContractStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `이미 처리된 계약입니다(현재 상태: ${contract.status}). 승인 대기 상태만 거절할 수 있습니다.`,
      );
    }
    contract.status = ContractStatus.REJECTED;
    return this.contractRepository.save(contract);
  }

  async remove(id: number): Promise<void> {
    const contract = await this.contractRepository.findOne({ where: { id } });
    if (!contract) {
      throw new NotFoundException(`ID가 ${id}인 계약을 찾을 수 없습니다.`);
    }
    await this.contractRepository.remove(contract);
  }
}
