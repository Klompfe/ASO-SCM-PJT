import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkOrder } from './entities/work-order.entity';
import { Item } from '../items/entities/item.entity';

@Injectable()
export class WorkOrdersService {
  constructor(
    @InjectRepository(WorkOrder)
    private readonly workOrderRepository: Repository<WorkOrder>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
  ) {}

  async create(createWorkOrderDto: any) {
    const workOrder = this.workOrderRepository.create(createWorkOrderDto);
    return await this.workOrderRepository.save(workOrder);
  }

  async findAll() {
    return await this.workOrderRepository.find({ relations: ['item'] });
  }

  async findOne(id: any) {
    const workOrder = await this.workOrderRepository.findOne({
      where: { id: id as any },
      relations: ['item'],
    });
    if (!workOrder) {
      throw new NotFoundException(`ID가 ${id}인 작업지시서를 찾을 수 없습니다.`);
    }
    return workOrder;
  }

  async update(id: any, updateWorkOrderDto: any) {
    await this.workOrderRepository.update(id, updateWorkOrderDto);
    return await this.findOne(id);
  }

  async getItemForWorkOrder(itemId: number) {
    const item = await this.itemRepository.findOne({
      where: { id: Number(itemId) },
    });
    if (!item) {
      throw new NotFoundException(`ID가 ${itemId}인 품목을 찾을 수 없습니다.`);
    }
    return item;
  }
}