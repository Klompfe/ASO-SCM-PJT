import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Style } from './entities/master.entities';
import { StyleService } from './services/style.service';
import { StyleController } from './style.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Style])],
  controllers: [StyleController],
  providers: [StyleService],
  exports: [StyleService],
})
export class MasterModule {}
