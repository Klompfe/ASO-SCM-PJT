import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Style, StyleMaterial, StyleLogistics } from './entities/style.entity';
import { StylesService } from './styles.service';
import { StylesController } from './styles.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Style, StyleMaterial, StyleLogistics])],
  controllers: [StylesController],
  providers: [StylesService],
})
export class StylesModule {}
