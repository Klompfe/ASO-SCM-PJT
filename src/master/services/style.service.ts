import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Style } from '../entities/master.entities';
import { StyleFilterDto } from '../../styles/dto/style-filter.dto';

@Injectable()
export class StyleService {
  constructor(@InjectRepository(Style) private repo: Repository<Style>) {}

  async findAll(filter: StyleFilterDto) {
    const where: any = {};
    if (filter.season) where.season = filter.season;
    if (filter.rddStart || filter.rddEnd) {
      where.rddDate = Between(
        filter.rddStart ? new Date(filter.rddStart) : new Date(0),
        filter.rddEnd ? new Date(filter.rddEnd) : new Date(),
      );
    }
    return await this.repo.find({ where });
  }
}
