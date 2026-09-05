import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MasterStyle } from './entities/master-style.entity';
import { StyleOverview, StyleOverviewStatus } from './entities/style-overview.entity';
import { CreateMasterStyleDto } from './dto/create-master-style.dto';

@Injectable()
export class StylesService {
  constructor(
    @InjectRepository(MasterStyle)
    private readonly masterStyleRepository: Repository<MasterStyle>,
    @InjectRepository(StyleOverview)
    private readonly overviewRepository: Repository<StyleOverview>,
  ) {}

  async findAll(): Promise<MasterStyle[]> {
    return this.masterStyleRepository.find({ relations: ['overview'] });
  }

  async create(dto: CreateMasterStyleDto): Promise<MasterStyle> {
    const existing = await this.masterStyleRepository.findOne({ where: { styleNo: dto.styleNo } });
    if (existing) {
      throw new BadRequestException(`이미 존재하는 스타일입니다: ${dto.styleNo}`);
    }

    const style = this.masterStyleRepository.create({ styleNo: dto.styleNo });
    const overview = this.overviewRepository.create({
      factory: dto.factory,
      buyer: dto.buyer,
      totalQty: dto.totalQty,
      brand: dto.brand,
      itemType: dto.itemType,
      productionType: dto.productionType,
      targetRdd: new Date(dto.targetRdd),
      cmtPrice: dto.cmtPrice ?? null,
      fobPrice: dto.fobPrice ?? null,
      status: StyleOverviewStatus.PENDING_APPROVAL,
      style,
    });
    style.overview = overview;

    return this.masterStyleRepository.save(style);
  }
}
