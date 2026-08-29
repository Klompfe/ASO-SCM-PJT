import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Style } from './entities/style.entity';

@Injectable()
export class StylesService {
  constructor(
    @InjectRepository(Style)
    private readonly styleRepository: Repository<Style>,
  ) {}

  async create(dto: any) {
    return await this.styleRepository.save(dto);
  }

  async findAll() {
    return await this.styleRepository.find();
  }
}
