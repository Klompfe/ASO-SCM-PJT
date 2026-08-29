import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { WorkOrder } from './entities/work-order.entity';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { Item } from '../items/entities/item.entity';
import { GetWorkOrdersFilterDto } from './dto/get-work-orders-filter.dto';
import { VisionService } from './vision.service';

@Injectable()
export class WorkOrdersService {
  constructor(
    @InjectRepository(WorkOrder)
    private readonly woRepository: Repository<WorkOrder>,
    private readonly dataSource: DataSource,
    private readonly visionService: VisionService,
  ) {}

  async analyzeWorkOrderImage(file: Express.Multer.File) {
    return await this.visionService.analyzeWorkOrder(file);
  }

  async create(dto: CreateWorkOrderDto): Promise<WorkOrder> {
    const item = await this.dataSource.getRepository(Item).findOne({
      where: { id: dto.itemId },
    });
    if (!item) {
      throw new NotFoundException(`ID가 ${dto.itemId}인 품목을 찾을 수 없습니다.`);
    }

    const wo = this.woRepository.create({
      targetQuantity: dto.targetQuantity,
      item,
    });

    return await this.woRepository.save(wo);
  }

  async findAll(filter?: GetWorkOrdersFilterDto) {
    const page = filter?.page || 1;
    const limit = filter?.limit || 10;
    const skip = (page - 1) * limit;

    const queryBuilder = this.woRepository.createQueryBuilder('wo')
      .leftJoinAndSelect('wo.item', 'item');

    if (filter?.status) {
      queryBuilder.andWhere('wo.status = :status', { status: filter.status });
    }

    if (filter?.itemId) {
      queryBuilder.andWhere('wo.itemId = :itemId', { itemId: filter.itemId });
    }

    if (filter?.startDate) {
      queryBuilder.andWhere('wo.createdAt >= :startDate', { startDate: filter.startDate });
    }

    if (filter?.endDate) {
      queryBuilder.andWhere('wo.createdAt <= :endDate', { endDate: filter.endDate });
    }

    queryBuilder
      .orderBy('wo.id', 'DESC')
      .skip(skip)
      .take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findOne(id: number): Promise<WorkOrder> {
    const wo = await this.woRepository.findOne({
      where: { id },
      relations: ['item'],
    });
    if (!wo) {
      throw new NotFoundException(`ID가 ${id}인 작업 지시를 찾을 수 없습니다.`);
    }
    return wo;
  }

  async updateStatus(id: number, statusOrDto: any): Promise<WorkOrder> {
    const wo = await this.findOne(id);
    const statusValue = typeof statusOrDto === 'object' && statusOrDto.status ? statusOrDto.status : statusOrDto;
    wo.status = statusValue;
    return await this.woRepository.save(wo);
  }

  async remove(id: number): Promise<void> {
    const wo = await this.findOne(id);
    await this.woRepository.remove(wo);
  }
}
