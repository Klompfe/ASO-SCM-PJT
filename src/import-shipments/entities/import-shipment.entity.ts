import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MasterStyle } from '../../styles/entities/master-style.entity';
import { ImportShipmentLine } from './import-shipment-line.entity';

// PR-082: 태일 VN 공장에서 생산된 완제품이 한국으로 수입통관되는 과정을 추적한다.
// 이름이 비슷한 기존 shipments 모듈(Shipment 엔티티, PurchaseOrder에 연결된
// "원자재 입고")과는 완전히 다른 물류 흐름이다 — 그건 옛 "선적관리 > 수입" 탭에
// 임시로 얹혀 있었지만 이번 PR에서 원래 자리(Purchase Orders)로 옮겼다.
//
// export-shipments(DRAFT->REVIEWED->FINALIZED 3단계)와 달리 완제품 수입통관은
// "통관 대기 -> 완료" 2단계면 충분하다고 판단해 단순화했다. 원부자재단가/선적일
// 계산은 이 저장소 밖의 "수입통관 이메일 에이전트"(Python)가 계속 담당하므로
// 이번 범위는 HS코드 자동조회/기록까지만이다.
export enum ImportShipmentStatus {
  PENDING_CLEARANCE = 'PENDING_CLEARANCE',
  CLEARED = 'CLEARED',
}

@Entity('import_shipments')
export class ImportShipment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  styleNo: string;

  @ManyToOne(() => MasterStyle)
  @JoinColumn({ name: 'styleNo', referencedColumnName: 'styleNo' })
  style: MasterStyle;

  // 베트남에서 발행하는 INVOICE 번호(예: "TYVN2026-26") — 수입통관 이메일
  // 에이전트가 메일 제목/본문에서 식별할 때 쓰는 키라 그대로 보관한다.
  @Column({ nullable: true })
  invoiceNo?: string | null;

  @Column({ type: 'date', nullable: true })
  invoiceDate?: Date | null;

  @Column({ type: 'varchar', enum: ImportShipmentStatus, default: ImportShipmentStatus.PENDING_CLEARANCE })
  status: ImportShipmentStatus;

  @Column({ type: 'date', nullable: true })
  clearedAt?: Date | null;

  @OneToMany(() => ImportShipmentLine, (line) => line.importShipment, { cascade: true })
  lines?: ImportShipmentLine[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
