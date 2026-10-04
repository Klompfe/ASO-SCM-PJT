import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Bom } from './bom.entity';
import { Item } from '../../items/entities/item.entity';

// PR-157: 콘(cone) 길이는 실 종류마다 다르다(사용자 확인 자료 기준). 향후 종류가
// 늘거나 콘길이가 바뀔 수 있어 화면에서 고칠 수 있는 설정값으로 관리하는 게 이상적이지만,
// 이번 PR은 우선 상수로 시작한다(완료 보고에서 별도 설정 테이블 필요 여부를 다시 제안).
export enum ThreadType {
  COA_SA = 'COA_SA', // 코아사
  OBA_SA_SKU_I_SA = 'OBA_SA_SKU_I_SA', // 오바사 / 스쿠이사
  POLY_JINUIDO = 'POLY_JINUIDO', // 폴리지누이도
}

// PR-175: 테이프류(다데/암홀) 서브타입 — threadType과 동일한 구조(사람이 직접 고르는
// nullable 필드, 텍스트 자동분류 안 함)로 둔다. 콘길이 대신 "50m/롤" 환산 기준이 쓰인다.
export enum TapeType {
  DADE = 'DADE', // 다데
  AMHOL = 'AMHOL', // 암홀
}

@Entity('bom_item_details')
export class BomItem {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Bom, (bom) => bom.items)
  bom: Bom;

  @ManyToOne(() => Item)
  material: Item;

  @Column()
  category: string; // 겉감, 안감 등

  @Column()
  colorCode: string;

  @Column()
  spec: string;

  @Column('decimal')
  consumption: number;

  @Column('decimal')
  requiredQty: number;

  // PR-098: 공급처는 작업지시서 문서 자체에는 없는 정보(실제 발주 단계에서 결정)라
  // "값이 없음"과 "N/A라는 문자열"을 구분해야 화면에서 정확히 "미정"으로 표시할 수
  // 있다 — nullable로 바꿔 mapping-commit.service.ts가 실제로 null을 저장하게 한다.
  @Column({ nullable: true })
  supplier: string | null;

  @Column('decimal')
  unitPrice: number;

  @Column()
  remarks: string;

  // PR-073: 수출 선적서류(INVOICE/Packing List) 자동생성용. 혼용율(예: "WOOL 98%,
  // POLYURETHANE 2%")과 HS코드는 짝값이다(혼용율이 바뀌면 HS코드도 바뀐다) — 둘 다
  // 스타일마다 달라지는 값이라 자재마스터(Item)가 아니라 BomItem에 둔다. 기존 데이터
  // 호환을 위해 둘 다 nullable.
  @Column({ nullable: true })
  composition?: string;

  @Column({ nullable: true })
  hsCode?: string;

  // PR-157: 실(THREAD) 자재의 콘(cone) 단가 환산에 쓰는 실 종류. category/자재명 텍스트
  // 만으로는 신뢰성 있게 자동 분류할 수 없다는 게 실 데이터 조사로 확인되었다(코아사/
  // 오바사/스쿠이사/지누이도/QQ사/곤타사/노카사/오파사/화나사/여기사/토바사/스파시사 등
  // 이 사양에 없는 이름까지 섞여 있고, "스쿠이사...지누이도"처럼 두 이름이 한 자재명에
  // 같이 나오는 경우도 있음) — 그래서 자동 분류 대신 사람이 직접 고르는 필드로 둔다.
  // 실이 아닌 자재는 항상 null. 값이 없는 실 자재는 콘가격을 계산하지 않고 경고만 띄운다.
  @Column({ type: 'varchar', enum: ThreadType, nullable: true })
  threadType?: ThreadType | null;

  // PR-175: 테이프류(다데/암홀) — threadType과 별도 컬럼으로 둔다(실/테이프는 서로
  // 다른 자재 종류라 한 BomItem이 동시에 둘 다일 수 없지만, 굳이 하나의 컬럼에
  // 합치지 않고 threadType과 같은 패턴을 유지해 기존 코드 영향을 최소화한다).
  @Column({ type: 'varchar', enum: TapeType, nullable: true })
  tapeType?: TapeType | null;
}
