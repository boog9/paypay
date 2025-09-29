import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'idempotency_keys' })
export class IdempotencyKeyEntity {
  @PrimaryColumn()
  key!: string;

  @Column({ name: 'tenant_id', nullable: true, type: 'varchar' })
  tenantId!: string | null;

  @Column()
  source!: string;

  @Column({ name: 'resource_id', nullable: true, type: 'varchar' })
  resourceId!: string | null;

  @CreateDateColumn({ name: 'ts' })
  timestamp!: Date;
}
