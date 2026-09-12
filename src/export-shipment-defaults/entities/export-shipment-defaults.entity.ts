import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

// PR-079: 매번 바뀌지 않는 회사 고정정보(선적자/수하인/출항지/도착지/운송사)의
// 기본값. 사실상 싱글턴이라 항상 id=1 행 하나만 쓴다(존재하지 않으면 PUT 시
// 처음 생성). sailingDate/sheetNo/invoiceDate는 건마다 달라지는 값이라
// 여기 포함하지 않는다 — export-shipments 생성 시 매번 직접 입력한다.
@Entity('export_shipment_defaults')
export class ExportShipmentDefaults {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  shipperInfo?: string;

  @Column({ nullable: true })
  consigneeInfo?: string;

  @Column({ nullable: true })
  portOfLoading?: string;

  @Column({ nullable: true })
  finalDestination?: string;

  @Column({ nullable: true })
  carrier?: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
