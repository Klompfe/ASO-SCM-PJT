import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ImportShipment } from './import-shipment.entity';

// PR-107: 색상·사이즈 단위 데이터는 ImportShipmentLine(스타일 단위)에 없어 새로
// 만든다. PackingReceiptCarton(원부자재 카톤, PR-074)의 color/size 자유입력
// 문자열 방식을 그대로 따른다 — 별도 색상/사이즈 마스터 테이블 없음.
export enum ImportShipmentPackingDetailSource {
  EXCEL = 'EXCEL',
  MANUAL = 'MANUAL',
}

@Entity('import_shipment_packing_details')
export class ImportShipmentPackingDetail {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  importShipmentId: number;

  @ManyToOne(() => ImportShipment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'importShipmentId' })
  importShipment: ImportShipment;

  // shipment.styleNo와 항상 동일 — 조회 시 매번 join하지 않아도 되도록 생성 시점에
  // 그대로 복사해 둔다(PackingReceiptCarton과 동일하게 비정규화 선례를 따름).
  @Column()
  styleNo: string;

  @Column()
  color: string;

  @Column()
  size: string;

  @Column({ type: 'decimal' })
  qty: number;

  // 지금은 실제 DETAIL PACKING 엑셀 시트 구조를 확보하지 못해 전부 MANUAL로만
  // 저장된다 — 자동 파싱 도입 후 EXCEL 값이 실제로 쓰이게 된다.
  @Column({ type: 'varchar', enum: ImportShipmentPackingDetailSource, default: ImportShipmentPackingDetailSource.MANUAL })
  source: ImportShipmentPackingDetailSource;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
