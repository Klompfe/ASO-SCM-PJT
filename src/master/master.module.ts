import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Style } from './entities/master.entities';

// StyleController/StyleService는 제거됨(PR-040) — GET /styles 라우트가 StylesModule과
// 충돌해 항상 빈 데이터만 반환하던 죽은 라우트였다(PR-039 진단). Style 엔티티를 참조하던
// 마지막 소비처(transaction/entities/bom.entity.ts, 미등록 죽은 엔티티)도 PR-044에서
// 제거되어, 이 시점 기준 Style을 실제로 쓰는 코드는 없다. 그럼에도 등록을 남겨둔 이유는
// master_styles 테이블 자체를 보존하기로 한 결정(PR-040, 사용자 확인) 때문 — styles/
// master_style과의 장기 통합 여부가 결정되기 전까지는 엔티티 등록을 유지한다.
@Module({
  imports: [TypeOrmModule.forFeature([Style])],
})
export class MasterModule {}
