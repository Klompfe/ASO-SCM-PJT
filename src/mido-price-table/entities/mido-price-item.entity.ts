import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// PR-157: 사용자가 제공한 "미도.단가표.pdf"(임가공 미도컴퍼니/라포랩스 원부자재 수출
// 단가)를 시드 데이터로 반영한다. PurchaseOrder.unitPrice(원화)가 없는 자재의 USD
// 단가 fallback으로 쓴다. 범위값(예: WOOL $2.5~$3)은 자동으로 하나를 고르지 않고
// priceUsdMin/Max를 함께 보여줘 담당자가 화면에서 직접 선택하게 한다(PR-156과 동일한
// 안전모드 원칙).
@Entity('mido_price_items')
export class MidoPriceItem {
  @PrimaryGeneratedColumn()
  id: number;

  // 단가표 항목명(예: "겉감(WOOL 60~70%)") — BomItem/Item 명칭과 완전히 일치하지 않을
  // 수 있어 자동 매칭을 강제하지 않는다(화면에서 후보 목록으로 보여주고 담당자가 고름).
  @Column()
  itemName: string;

  @Column({ type: 'decimal' })
  priceUsdMin: number;

  @Column({ type: 'decimal' })
  priceUsdMax: number;

  // 단가 단위(예: "EA", "M", "야드") — 실(THREAD)은 항상 "M"(미터당)이고, 콘 단가
  // 환산은 thread-cone-price.util.ts가 별도로 처리한다.
  @Column()
  unit: string;

  @Column({ nullable: true })
  note?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
