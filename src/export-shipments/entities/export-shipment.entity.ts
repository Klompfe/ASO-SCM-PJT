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

// PR-080: PurchaseOrder/PackingReceipt를 집계해 자동 생성한 문서(GENERATED, PR-075)와
// 이미 완성되어 있던 INVOICE/Packing List 엑셀을 그대로 가져온 문서(IMPORTED)를
// 구분한다. IMPORTED 문서의 라인은 대응하는 PackingReceipt가 없다.
export enum ExportShipmentSource {
  GENERATED = 'GENERATED',
  IMPORTED = 'IMPORTED',
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

  @Column({ type: 'varchar', enum: ExportShipmentSource, default: ExportShipmentSource.GENERATED })
  source: ExportShipmentSource;

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

  // PR-157: USD 환율은 unipass.customs.go.kr 크롤링을 시도했으나 robots.txt가
  // "/csp/"(요청된 페이지 경로 전체)를 명시적으로 차단하고 있어(User-agent: * /
  // Disallow: /csp/) 구현하지 않았다(사용자가 이미 "크롤링이 어려우면 수동 입력"으로
  // 허용). 문서 저장 시점에 담당자가 직접 입력하고, 그 값을 재사용한다(매번 다시
  // 입력하지 않도록 문서에 저장).
  @Column({ type: 'decimal', nullable: true })
  exchangeRateUsdKrw?: number | null;

  @Column({ type: 'date', nullable: true })
  exchangeRateDate?: Date | null;

  @OneToMany(() => ExportShipmentLine, (line) => line.exportShipment, { cascade: true })
  lines?: ExportShipmentLine[];

  @CreateDateColumn()
  createdAt: Date;
}
