import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Receiving } from '../entities/transaction.entities';

@Injectable()
export class ReceivingService {
  constructor(@InjectRepository(Receiving) private repo: Repository<Receiving>) {}

  async findAll(filter: { batch?: string; onlyPending?: boolean }) {
    const where: any = {};
    if (filter.batch) where.shipmentBatch = filter.batch;
    if (filter.onlyPending) where.balanceQty = MoreThan(0);
    return await this.repo.find({ where, relations: ['purchaseOrder'] });
  }
}
