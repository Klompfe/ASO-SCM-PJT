import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';

// PR-140: 화면의 상태값(작업지시 목록의 "Filter by Status" 등)을 하드코딩 enum 대신 관리자가
// 추가/수정할 수 있는 마스터 테이블로 옮긴다. domain으로 어느 모듈의 상태값인지 구분한다
// (예: 'WORK_ORDER'). 1단계는 WorkOrder 하나만 이 테이블을 실제로 쓰고, 나머지 모듈
// (Contract/PurchaseOrder/Shipment 등)은 이후 PR에서 도메인을 하나씩 추가해 같은 테이블을
// 재사용한다 — 테이블/엔티티 자체는 이미 다중 도메인을 염두에 두고 설계됐다.
@Entity('status_codes')
@Unique(['domain', 'code'])
export class StatusCode {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  domain: string;

  @Column()
  code: string;

  @Column()
  label: string;

  @Column({ default: 0 })
  sortOrder: number;

  // 비활성화하면 신규 선택(필터 드롭다운/상태 변경)에는 더 이상 나오지 않지만, 이미 그 값을
  // 쓰고 있는 기존 데이터(예: WorkOrder.status)는 그대로 유지된다 — 삭제와 달리 데이터 보존.
  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
