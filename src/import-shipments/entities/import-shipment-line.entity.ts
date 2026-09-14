import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { ImportShipment } from './import-shipment.entity';

// PR-082: 실제 수입 INVOICE 원본에는 "재직" 항목이 명시적으로 없는 경우가 많아
// 기본값을 '직물'로 두고(PR-081 HS코드 분류표의 재직 값 대부분이 '직물') 필요시
// 화면에서 수동 수정할 수 있게 한다.
const DEFAULT_FABRIC_TYPE = '직물';

@Entity('import_shipment_lines')
export class ImportShipmentLine {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  importShipmentId: number;

  @ManyToOne(() => ImportShipment, (shipment) => shipment.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'importShipmentId' })
  importShipment: ImportShipment;

  @Column()
  itemType: string;

  // PR-083.1: Vietnam INVOICE 업로드로 생성된 라인 중, HS코드 마스터(PR-081)에
  // 아직 없는 신규 스타일은 혼용률을 구할 방법이 없다(인보이스 자체에 혼용률
  // 컬럼이 없음) — 그런 경우 null로 남긴다.
  @Column({ nullable: true })
  composition?: string | null;

  @Column({ default: DEFAULT_FABRIC_TYPE })
  fabricType: string;

  // PR-081 HsCodeClassification에서 자동조회한 값 — 일치하는 조합이 없으면
  // null로 저장하고 컨트롤러/서비스 응답에서 unmatched:true로 표시한다.
  @Column({ nullable: true })
  hsCode?: string | null;

  @Column({ type: 'decimal' })
  qty: number;

  @Column()
  unit: string;

  @Column({ type: 'decimal', nullable: true })
  unitPrice?: number | null;

  @Column({ type: 'decimal', nullable: true })
  amount?: number | null;

  @Column({ type: 'decimal', nullable: true })
  netWeight?: number | null;

  @Column({ type: 'decimal', nullable: true })
  grossWeight?: number | null;

  @Column({ type: 'int', nullable: true })
  packageCount?: number | null;
}
