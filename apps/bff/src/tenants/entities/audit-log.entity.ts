import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TIMESTAMP_COLUMN_TYPE } from '../../database/utils/column-types';
import { TenantEntity } from './tenant.entity';

@Entity({ name: 'audit_logs' })
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => TenantEntity, (tenant) => tenant.auditLogs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: TenantEntity;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'actor_id', type: 'varchar', length: 160, nullable: true })
  actorId: string | null = null;

  @Column({ type: 'varchar', length: 160 })
  action!: string;

  @Column({ type: 'varchar', length: 160 })
  resource!: string;

  @Column({ type: 'varchar', length: 32 })
  result!: string;

  @Column({ nullable: true, type: 'varchar', length: 64 })
  ip!: string | null;

  @CreateDateColumn({ name: 'ts', type: TIMESTAMP_COLUMN_TYPE })
  timestamp!: Date;
}
