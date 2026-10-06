import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialCategory } from './entities/material-category.entity';
import { MaterialCategoriesService } from './material-categories.service';
import { MaterialCategoriesController } from './material-categories.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MaterialCategory])],
  controllers: [MaterialCategoriesController],
  providers: [MaterialCategoriesService],
  exports: [MaterialCategoriesService, TypeOrmModule],
})
export class MaterialCategoriesModule {}
