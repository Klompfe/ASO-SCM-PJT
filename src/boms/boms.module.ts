import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { Bom } from './entities/bom.entity';
import { Item } from '../items/entities/item.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Bom, Item]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    AuthModule,
  ],
  exports: [TypeOrmModule],
})
export class BomsModule {}