import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

// PR-079: 매번 바뀌지 않는 회사 고정정보(선적자/수하인/출항지/도착지)의
// 기본값. 사실상 싱글턴이라 항상 id=1 행 하나만 쓴다(존재하지 않으면 PUT 시
// 처음 생성). sailingDate/sheetNo/invoiceDate는 건마다 달라지는 값이라
// 여기 포함하지 않는다 — export-shipments 생성 시 매번 직접 입력한다.
// PR-193: carrier 컬럼은 과거 데이터 보존을 위해 남겨두지만(추가 전용 원칙 —
// 삭제하지 않음) 더 이상 저장/조회에 쓰이지 않는다(ExportShipmentDefaultsService.update()가
// 무시함) — Carrier는 선적 건마다 바뀌는 값이라 기본값 대상에서 빠졌다.
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
