import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { User, UserRole } from '../../users/entities/user.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';
import { Item, ItemType } from '../../items/entities/item.entity';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  console.log('🌱 Seed 데이터 투입을 시작합니다...');

  // 1. 초기 관리자 계정 생성
  const userRepo = dataSource.getRepository(User);
  const existingUser = await userRepo.findOne({ where: { email: 'admin@scm.com' } });
  if (!existingUser) {
    const hashedPassword = await bcrypt.hash('admin1234!', 10);
    await userRepo.save({
      username: 'admin', // username 필드 추가
      email: 'admin@scm.com',
      password: hashedPassword,
      name: '시스템 관리자',
      role: UserRole.ADMIN,
    });
    console.log('✅ 관리자 계정 생성 완료 (admin@scm.com / admin1234!)');
  }

  // 2. 초기 공급업체 생성
  const supplierRepo = dataSource.getRepository(Supplier);
  const existingSupplier = await supplierRepo.findOne({ where: { code: 'SUP001' } });
  let supplier = existingSupplier;
  if (!existingSupplier) {
    supplier = await supplierRepo.save({
      code: 'SUP001',
      name: '글로벌 원자재 주식회사',
      contactPerson: '김철수',
      email: 'contact@supplier.com',
      phone: '010-1234-5678',
    });
    console.log('✅ 초기 공급업체 생성 완료 (SUP001)');
  }

  // 3. 초기 품목 생성
  const itemRepo = dataSource.getRepository(Item);
  const existingItem = await itemRepo.findOne({ where: { code: 'RAW001' } });
  if (!existingItem) {
    await itemRepo.save({
      code: 'RAW001',
      name: '고급 원면 원단',
      type: ItemType.RAW_MATERIAL,
      unitPrice: 15000,
      safetyStock: 100,
    });
    console.log('✅ 초기 품목 생성 완료 (RAW001)');
  }

  console.log('🎉 Seed 데이터 투입이 성공적으로 완료되었습니다!');
  await app.close();
}

bootstrap().catch((err) => {
  console.error('❌ Seed 데이터 투입 중 오류 발생:', err);
  process.exit(1);
});