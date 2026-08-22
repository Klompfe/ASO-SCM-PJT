import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { WorkOrder } from './entities/work-order.entity';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderStatusDto } from './dto/update-work-order-status.dto';
import { Item } from '../items/entities/item.entity';

@Injectable()
export class WorkOrdersService {
  constructor(
    @InjectRepository(WorkOrder)
    private readonly woRepository: Repository<WorkOrder>,
    private readonly dataSource: DataSource,
  ) {}

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

  async findAll(): Promise<WorkOrder[]> {
    return await this.woRepository.find({
      relations: ['item'],
      order: { id: 'DESC' },
    });
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