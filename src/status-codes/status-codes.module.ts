import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatusCode } from './entities/status-code.entity';
import { StatusCodesService } from './status-codes.service';
import { StatusCodesController } from './status-codes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StatusCode])],
  controllers: [StatusCodesController],
  providers: [StatusCodesService],
  exports: [StatusCodesService],
})
export class StatusCodesModule {}
