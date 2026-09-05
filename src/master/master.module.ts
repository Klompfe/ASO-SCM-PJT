import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Style } from './entities/master.entities';

// StyleController/StyleService는 제거됨(PR-040) — GET /styles 라우트가 StylesModule과
// 충돌해 항상 빈 데이터만 반환하던 죽은 라우트였다(PR-039 진단). Style 엔티티 자체는
// transaction/entities/bom.entity.ts(미등록 모듈, 이번 PR 범위 밖)가 여전히 참조하므로
// 엔티티 등록만 남겨둔다.
@Module({
  imports: [TypeOrmModule.forFeature([Style])],
})
export class MasterModule {}
