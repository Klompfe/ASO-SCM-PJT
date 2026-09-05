import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkOrderSpec } from './entities/work-order-spec.entity';
import { AiSizeSpecRowDto } from './dto/ai-analysis.dto';

@Injectable()
export class WorkOrderSpecsService {
  constructor(
    @InjectRepository(WorkOrderSpec)
    private readonly specRepository: Repository<WorkOrderSpec>,
  ) {}

  async save(styleNo: string, workNotes: string | null, sizeSpecs: AiSizeSpecRowDto[]): Promise<WorkOrderSpec> {
    const spec = this.specRepository.create({
      styleNo,
      workNotes,
      sizeSpecs: sizeSpecs.map((row) => ({
        part: row.part,
        size: row.size,
        instructedValue: row.instructedValue ?? null,
        sampleValue: row.sampleValue ?? null,
        diffValue: row.diffValue ?? null,
        finalValue: row.finalValue ?? null,
      })),
    });
    return this.specRepository.save(spec);
  }

  async findByStyleNo(styleNo: string): Promise<WorkOrderSpec[]> {
    return this.specRepository.find({
      where: { styleNo },
      relations: ['sizeSpecs'],
      order: { createdAt: 'DESC' },
    });
  }
}
