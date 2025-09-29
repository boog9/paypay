import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TenantEntity } from './tenant.entity';

@Entity({ name: 'audit_logs' })
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => TenantEntity, (tenant) => tenant.auditLogs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: TenantEntity;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ name: 'actor_id', nullable: true, type: 'varchar' })
  actorId: string | null = null;

  @Column()
  action!: string;

  @Column()
  resource!: string;

  @Column()
  result!: string;

  @Column({ nullable: true, type: 'varchar' })
  ip!: string | null;

  @CreateDateColumn({ name: 'ts' })
  timestamp!: Date;
}
