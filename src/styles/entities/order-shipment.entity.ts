import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { MasterStyle } from './master-style.entity';

// 완제품을 바이어에게 내보내는 출고(아웃바운드)를 기록한다(PR-063) — 이름이 비슷한 기존
// shipments 모듈(Shipment 엔티티)과 혼동하면 안 된다: 그건 PurchaseOrder에 연결된
// "원자재 입고(공급업체→자사)"이고, 이 엔티티는 "완제품 출고(자사→바이어)"로 완전히 다른
// 물류 흐름이다. 실제 공장 생산일보 분석 결과 한 오더가 여러 차수(최대 5차까지 관찰됨)로
// 나뉘어 출고되는 게 일반적이라 installmentNo로 차수를 구분한다.
@Entity('order_shipments')
export class OrderShipment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  styleNo: string;

  @ManyToOne(() => MasterStyle)
  @JoinColumn({ name: 'styleNo', referencedColumnName: 'styleNo' })
  style: MasterStyle;

  @Column({ type: 'int' })
  installmentNo: number;

  @Column({ type: 'date' })
  plannedShipDate: Date;

  // 출고 전엔 null — 이 값의 존재 여부로 "계획/완료" 상태를 파생하므로 별도 status
  // 컬럼을 두지 않는다.
  @Column({ type: 'date', nullable: true })
  actualShipDate: Date | null;

  @Column({ type: 'decimal' })
  quantity: number;

  // 실제 생산일보의 REMARK 컬럼과 동일한 역할(예: 반품, 초과출고 사유 메모).
  @Column({ nullable: true })
  remark: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
