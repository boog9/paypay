import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { TenantEntity } from './tenant.entity';

@Entity({ name: 'stores' })
export class StoreEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => TenantEntity, (tenant) => tenant.stores, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: TenantEntity;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ name: 'btcpay_host' })
  btcpayHost!: string;

  @Column({ name: 'btcpay_store_id' })
  btcpayStoreId!: string;

  @Column({ name: 'store_name', nullable: true })
  storeName!: string | null;

  @Column({ name: 'store_website', nullable: true })
  storeWebsite!: string | null;

  @Column({ name: 'store_key_last_four', nullable: true, length: 4 })
  storeKeyLastFour!: string | null;

  @Column({ name: 'api_key_ciphertext', type: 'text' })
  apiKeyCiphertext!: string;

  @Column({ name: 'api_key_dek_wrapped', type: 'text' })
  apiKeyDekWrapped!: string;

  @Column({ name: 'webhook_id' })
  webhookId!: string;

  @Column({ name: 'webhook_secret_ciphertext', type: 'text' })
  webhookSecretCiphertext!: string;

  @Column({ name: 'webhook_secret_dek_wrapped', type: 'text' })
  webhookSecretDekWrapped!: string;

  @Column({ name: 'wallet_setup_status', default: 'pending' })
  walletSetupStatus!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
