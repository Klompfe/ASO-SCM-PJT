// PR-099: 작업지시서에 굳이 적혀 있지 않아도 관례상 항상 들어가는 라벨류 부자재
// "기본 세트" — 실무에서 스타일마다 매번 손으로 하나씩 입력하는 대신 한 번에 반영
// 하기 위해 정의한다. 별도 마스터 테이블까지는 이 PR 범위가 아니라 코드 내 배열로
// 둔다. 실제 items 테이블에는 같은 자재도 줄바꿈/부가텍스트가 섞인 여러 변형
// 이름으로 중복 등록되어 있어(예: "CARE LABEL\r\n케어라벨\r\nMDM-13" 등 6종) 그중
// 하나를 그대로 따르는 것은 의미가 없다 — 여기서는 깨끗한 표준 표기를 새로 쓴다
// ('이미지택'은 마침 기존 마스터에 정확히 이 표기로 이미 있어 그대로 재사용된다).
export interface LabelSetItem {
  itemName: string;
  category: string;
  consumption: number;
}

export const LABEL_SET: LabelSetItem[] = [
  { itemName: 'MAIN+SIZE LABEL', category: '라벨', consumption: 1 },
  { itemName: 'CARE LABEL', category: '라벨', consumption: 1 },
  { itemName: 'PRICE TAG', category: '라벨', consumption: 1 },
  { itemName: 'SIZE STICKER', category: '라벨', consumption: 1 },
  { itemName: 'TAG PIN', category: '라벨', consumption: 1 },
  { itemName: '이미지택', category: '라벨', consumption: 1 },
  { itemName: 'POLY BAG', category: '포장', consumption: 1 },
];
