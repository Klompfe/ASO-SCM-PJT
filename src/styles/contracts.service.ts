import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contract } from './entities/contract.entity';
import { MasterStyle } from './entities/master-style.entity';
import { IssueContractDto } from './dto/issue-contract.dto';

@Injectable()
export class ContractsService {
  constructor(
    @InjectRepository(Contract)
    private readonly contractRepository: Repository<Contract>,
    @InjectRepository(MasterStyle)
    private readonly masterStyleRepository: Repository<MasterStyle>,
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
}
