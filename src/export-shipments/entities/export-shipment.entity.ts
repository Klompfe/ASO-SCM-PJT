import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
} from 'typeorm';
import { ExportShipmentLine } from './export-shipment-line.entity';

export enum ExportShipmentStatus {
  DRAFT = 'DRAFT',
  REVIEWED = 'REVIEWED',
  FINALIZED = 'FINALIZED',
}

// PR-075: INVOICE/Packing List 자동생성 문서 헤더. 한 선적건에 여러 스타일이 섞일 수
// 있어(실제 원본 파일에서도 BF6X27C51/BF6X21C52/BF6X21C63 등 여러 STYLE NO가 한
// INVOICE에 함께 나왔다) styleNos를 배열로 둔다. 헤더 필드(shipper/consignee 등)는
// PurchaseOrder/PackingReceipt에서 파생할 수 없는 물류 정보라 생성 시 입력받거나
// 이후 사람이 채워 넣는다.
@Entity('export_shipments')
export class ExportShipment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('simple-array', { nullable: true })
  styleNos?: string[];

  @Column({ type: 'varchar', enum: ExportShipmentStatus, default: ExportShipmentStatus.DRAFT })
  status: ExportShipmentStatus;

  @Column({ nullable: true })
  sheetNo?: string;

  @Column({ type: 'date', nullable: true })
  invoiceDate?: Date | null;

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

  @Column({ type: 'date', nullable: true })
  sailingDate?: Date | null;

  @OneToMany(() => ExportShipmentLine, (line) => line.exportShipment, { cascade: true })
  lines?: ExportShipmentLine[];

  @CreateDateColumn()
  createdAt: Date;
}
