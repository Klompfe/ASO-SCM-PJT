import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MasterStyle } from './entities/master-style.entity';
import { StyleOverview } from './entities/style-overview.entity';
import { StylesService } from './styles.service';
import { StylesController } from './styles.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MasterStyle, StyleOverview])],
  controllers: [StylesController],
  providers: [StylesService],
})
export class StylesModule {}
