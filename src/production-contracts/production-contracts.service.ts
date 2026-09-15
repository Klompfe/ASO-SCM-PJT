import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ProductionContract,
  ProductionContractPriceSource,
  ProductionContractPriceStatus,
} from './entities/production-contract.entity';
import { CreateProductionContractDto } from './dto/create-production-contract.dto';
import { UpdateProductionContractDto } from './dto/update-production-contract.dto';

@Injectable()
export class ProductionContractsService {
  constructor(
    @InjectRepository(ProductionContract)
    private readonly productionContractRepository: Repository<ProductionContract>,
  ) {}

  // PR-093: 1단계(PRE_AGREED)는 생성 시점에 단가가 반드시 있어야 하고(고객사 계약에서
  // 이미 정해진 값을 그대로 스냅샷), 2단계(CMT_INVOICE)는 생성 시점에 단가를 절대
  // 알 수 없으므로 반드시 없어야 한다(값을 넣으면 오히려 잘못된 입력). priceStatus는
  // priceSource로부터 결정되며 생성 후에는 이번 PR 범위에서 별도로 바꾸지 않는다
  // (CMT_INVOICE → CONFIRMED 전환은 2단계의 "IV CMT 시트 파싱" PR에서 붙는다).
  async create(dto: CreateProductionContractDto): Promise<ProductionContract> {
    if (dto.priceSource === ProductionContractPriceSource.PRE_AGREED && dto.cmtPrice == null) {
      throw new BadRequestException(
        '단가원천이 PRE_AGREED(사전확정)이면 생성 시점에 cmtPrice가 반드시 있어야 합니다.',
      );
    }
    if (dto.priceSource === ProductionContractPriceSource.CMT_INVOICE && dto.cmtPrice != null) {
      throw new BadRequestException(
        '단가원천이 CMT_INVOICE(사후확정)이면 생성 시점에 cmtPrice를 넣을 수 없습니다(2단계에서만 채워짐).',
      );
    }

    const priceStatus =
      dto.priceSource === ProductionContractPriceSource.PRE_AGREED
        ? ProductionContractPriceStatus.CONFIRMED
        : ProductionContractPriceStatus.PENDING_CMT_INVOICE;

    const contract = this.productionContractRepository.create({
      styleNo: dto.styleNo,
      manufacturerId: dto.manufacturerId,
      priceSource: dto.priceSource,
      cmtPrice: dto.cmtPrice ?? null,
      priceStatus,
      quantity: dto.quantity,
      contractDate: new Date(dto.contractDate),
      note: dto.note ?? null,
    });
    return this.productionContractRepository.save(contract);
  }

  async findAll(): Promise<ProductionContract[]> {
    return this.productionContractRepository.find({
      relations: ['manufacturer'],
      order: { id: 'DESC' },
    });
  }

  async findOne(id: number): Promise<ProductionContract> {
    const contract = await this.productionContractRepository.findOne({
      where: { id },
      relations: ['manufacturer'],
    });
    if (!contract) {
      throw new NotFoundException(`ID가 ${id}인 생산계약을 찾을 수 없습니다.`);
    }
    return contract;
  }

  async update(id: number, dto: UpdateProductionContractDto): Promise<ProductionContract> {
    const contract = await this.findOne(id);
    const { contractDate, ...rest } = dto;
    Object.assign(contract, rest);
    if (contractDate !== undefined) {
      contract.contractDate = new Date(contractDate);
    }
    return this.productionContractRepository.save(contract);
  }

  async remove(id: number): Promise<void> {
    const contract = await this.findOne(id);
    await this.productionContractRepository.remove(contract);
  }
}
