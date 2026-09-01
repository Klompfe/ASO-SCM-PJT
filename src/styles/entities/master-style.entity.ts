import { Entity, PrimaryColumn, OneToOne, JoinColumn, OneToMany } from 'typeorm';
import { StyleOverview } from './style-overview.entity';
import { Bom } from '../../boms/entities/bom.entity';

@Entity()
export class MasterStyle {
  @PrimaryColumn()
  styleNo: string;

  @OneToOne(() => StyleOverview, (overview) => overview.style, { cascade: true })
  @JoinColumn()
  overview: StyleOverview;

  @OneToMany(() => Bom, (bom) => bom.style)
  boms: Bom[];
}
