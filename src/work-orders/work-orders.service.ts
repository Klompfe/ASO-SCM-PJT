import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkOrder, WorkOrderStatus } from './entities/work-order.entity';
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
    const { itemId, quantity } = createWorkOrderDto;

    const item = await this.itemRepository.findOne({
      where: { id: +itemId },
    });

    if (!item) {
      throw new NotFoundException(`ID가 ${itemId}인 품목을 찾을 수 없습니다.`);
    }

    const workOrder = this.workOrderRepository.create({
      item,
      quantity: +quantity,
      status: WorkOrderStatus.PENDING,
    });

    return await this.workOrderRepository.save(workOrder);
  }

  async findAll() {
    return await this.workOrderRepository.find({
      relations: ['item'],
    });
  }

  async findOne(id: string) {
    const workOrder = await this.workOrderRepository.findOne({
      where: { id },
      relations: ['item'],
    });

    if (!workOrder) {
      throw new NotFoundException(`ID가 ${id}인 작업 지시서를 찾을 수 없습니다.`);
    }

    return workOrder;
  }

  async update(id: string, updateWorkOrderDto: any) {
    const workOrder = await this.findOne(id);

    if (updateWorkOrderDto.status) {
      workOrder.status = updateWorkOrderDto.status;
    }

    if (updateWorkOrderDto.quantity) {
      workOrder.quantity = +updateWorkOrderDto.quantity;
    }

    return await this.workOrderRepository.save(workOrder);
  }
}