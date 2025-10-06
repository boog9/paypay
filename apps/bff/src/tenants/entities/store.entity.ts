import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { TIMESTAMP_COLUMN_TYPE } from '../../database/utils/column-types';
import { TenantEntity } from './tenant.entity';

@Entity({ name: 'stores' })
export class StoreEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => TenantEntity, (tenant) => tenant.stores, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: TenantEntity;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'btcpay_host', type: 'varchar', length: 320 })
  btcpayHost!: string;

  @Column({ name: 'btcpay_store_id', type: 'varchar', length: 160 })
  btcpayStoreId!: string;

  @Column({ name: 'store_name', type: 'varchar', length: 160, nullable: true })
  storeName!: string | null;

  @Column({ name: 'store_website', type: 'varchar', length: 2048, nullable: true })
  storeWebsite!: string | null;

  @Column({ name: 'store_key_last_four', type: 'varchar', nullable: true, length: 4 })
  storeKeyLastFour!: string | null;

  @Column({ name: 'api_key_managed_by_tenant', type: 'boolean', default: false })
  apiKeyManagedByTenant!: boolean;

  @Column({ name: 'api_key_ciphertext', type: 'text' })
  apiKeyCiphertext!: string;

  @Column({ name: 'api_key_dek_wrapped', type: 'text' })
  apiKeyDekWrapped!: string;

  @Column({ name: 'webhook_id', type: 'varchar', length: 160 })
  webhookId!: string;

  @Column({ name: 'webhook_secret_ciphertext', type: 'text' })
  webhookSecretCiphertext!: string;

  @Column({ name: 'webhook_secret_dek_wrapped', type: 'text' })
  webhookSecretDekWrapped!: string;

  @Column({ name: 'wallet_setup_status', type: 'varchar', length: 32, default: 'pending' })
  walletSetupStatus!: string;

  @CreateDateColumn({ name: 'created_at', type: TIMESTAMP_COLUMN_TYPE })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: TIMESTAMP_COLUMN_TYPE })
  updatedAt!: Date;
}
