import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { Item } from './entities/item.entity';
import { ItemsService } from './items.service';
import { ItemsController } from './items.controller';
import { AuthModule } from '../auth/auth.module';
import { BomsModule } from '../boms/boms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Item]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    AuthModule,
    BomsModule,
  ],
  controllers: [ItemsController],
  providers: [ItemsService],
  exports: [ItemsService],
})
export class ItemsModule {}