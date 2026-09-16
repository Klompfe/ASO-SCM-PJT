import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { MasterStyle } from './entities/master-style.entity';
import { StyleOverview, StyleOverviewStatus } from './entities/style-overview.entity';
import { Contract } from './entities/contract.entity';
import { OrderProcessStage } from './entities/order-process-stage.entity';
import { OrderShipment } from './entities/order-shipment.entity';
import { Bom } from '../boms/entities/bom.entity';
import { BomItem } from '../boms/entities/bom-item.entity';
import { CreateMasterStyleDto } from './dto/create-master-style.dto';

@Injectable()
export class StylesService {
  constructor(
    @InjectRepository(MasterStyle)
    private readonly masterStyleRepository: Repository<MasterStyle>,
    @InjectRepository(StyleOverview)
    private readonly overviewRepository: Repository<StyleOverview>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(filter?: { styleNo?: string; targetRddFrom?: string; targetRddTo?: string; itemType?: string }): Promise<MasterStyle[]> {
    const qb = this.masterStyleRepository
      .createQueryBuilder('style')
      .leftJoinAndSelect('style.overview', 'overview');

    if (filter?.styleNo) {
      qb.andWhere('style.styleNo LIKE :styleNo', { styleNo: `%${filter.styleNo}%` });
    }
    if (filter?.targetRddFrom) {
      qb.andWhere('overview.targetRdd >= :targetRddFrom', { targetRddFrom: filter.targetRddFrom });
    }
    if (filter?.targetRddTo) {
      qb.andWhere('overview.targetRdd <= :targetRddTo', { targetRddTo: filter.targetRddTo });
    }
    // PR-101: itemType은 카테고리성 값이라 부분일치가 아니라 정확히 일치로 필터링한다.
    if (filter?.itemType) {
      qb.andWhere('overview.itemType = :itemType', { itemType: filter.itemType });
    }

    return qb.getMany();
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

  // [정리] MasterStyle 삭제 — 모든 관련 FK가 ON DELETE NO ACTION으로 걸려 있어(초기
  // 마이그레이션 확인) DB가 자동으로 cascade 삭제해주지 않는다. Bom/BomItem/Contract/
  // OrderProcessStage/OrderShipment/StyleOverview까지 이 서비스에서 순서대로 직접
  // 지워야 하며, 하나라도 실패하면 전부 롤백되도록 QueryRunner 트랜잭션으로 묶는다
  // (GEMINI.md 4.2절 패턴). Item.styleNo는 FK가 아니라 값만 저장하는 컬럼이라
  // (item.entity.ts 주석 참고, 순환 의존 회피 목적) 여기서 건드리지 않는다 — 스타일
  // 삭제 후에도 해당 styleNo를 참조하는 완제품 Item은 그대로 남는다(기존 설계).
  async remove(styleNo: string): Promise<void> {
    const style = await this.masterStyleRepository.findOne({
      where: { styleNo },
      relations: ['overview'],
    });
    if (!style) {
      throw new NotFoundException(`등록된 스타일이 없습니다: ${styleNo}`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const boms = await queryRunner.manager.find(Bom, { where: { style: { styleNo } } });
      const bomIds = boms.map((b) => b.id);
      if (bomIds.length > 0) {
        await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(BomItem)
          .where('"bomId" IN (:...bomIds)', { bomIds })
          .execute();
        await queryRunner.manager.delete(Bom, { id: In(bomIds) });
      }

      await queryRunner.manager.delete(Contract, { styleNo });
      await queryRunner.manager.delete(OrderProcessStage, { styleNo });
      await queryRunner.manager.delete(OrderShipment, { styleNo });

      const overviewId = style.overview?.id;
      await queryRunner.manager.delete(MasterStyle, { styleNo });
      if (overviewId) {
        await queryRunner.manager.delete(StyleOverview, { id: overviewId });
      }

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
