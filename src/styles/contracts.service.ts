import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Contract, ContractStatus } from './entities/contract.entity';
import { MasterStyle } from './entities/master-style.entity';
import { IssueContractDto } from './dto/issue-contract.dto';

@Injectable()
export class ContractsService {
  constructor(
    @InjectRepository(Contract)
    private readonly contractRepository: Repository<Contract>,
    @InjectRepository(MasterStyle)
    private readonly masterStyleRepository: Repository<MasterStyle>,
    private readonly dataSource: DataSource,
  ) {}

  async issue(dto: IssueContractDto): Promise<Contract> {
    const style = await this.masterStyleRepository.findOne({ where: { styleNo: dto.styleNo } });
    if (!style) {
      throw new NotFoundException(`존재하지 않는 스타일입니다: ${dto.styleNo}`);
    }
    const contract = this.contractRepository.create({
      styleNo: dto.styleNo,
      notes: dto.notes ?? null,
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
