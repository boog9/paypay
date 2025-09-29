import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { StoreEntity } from './store.entity';
import { AuditLogEntity } from './audit-log.entity';

@Entity({ name: 'tenants' })
export class TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  name!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => StoreEntity, (store) => store.tenant)
  stores!: StoreEntity[];

  @OneToMany(() => AuditLogEntity, (log) => log.tenant)
  auditLogs!: AuditLogEntity[];
}
