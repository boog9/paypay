import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { TIMESTAMP_COLUMN_TYPE } from '../../database/utils/column-types';

@Entity({ name: 'idempotency_keys' })
export class IdempotencyKeyEntity {
  @PrimaryColumn({ type: 'varchar', length: 200 })
  key!: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 160 })
  source!: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  route!: string | null;

  @Column({ name: 'resource_id', type: 'varchar', length: 160, nullable: true })
  resourceId!: string | null;

  @Column({ name: 'response_status', type: 'integer', nullable: true })
  responseStatus!: number | null;

  @Column({ name: 'response_body', type: 'text', nullable: true })
  responseBody!: string | null;

  @CreateDateColumn({ name: 'ts', type: TIMESTAMP_COLUMN_TYPE })
  timestamp!: Date;
}
