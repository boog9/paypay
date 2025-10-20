import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn
} from 'typeorm';
import { TIMESTAMP_COLUMN_TYPE } from '../database/utils/column-types';
import { UserEntity } from '../auth/entities/user.entity';

@Entity({ name: 'managed_stores' })
@Index('ix_managed_stores_user_id', ['userId'])
@Unique('uq_managed_stores_user_store', ['userId', 'btcpayStoreId'])
export class ManagedStoreEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, (user) => user.managedStores, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ name: 'btcpay_store_id', type: 'varchar', length: 64 })
  btcpayStoreId!: string;

  @Column({ name: 'store_name', type: 'varchar', length: 200 })
  storeName!: string;

  @Column({ name: 'default_currency', type: 'varchar', length: 16 })
  defaultCurrency!: string;

  @Column({ name: 'btcpay_host', type: 'varchar', length: 200 })
  btcpayHost!: string;

  // base64-encoded ciphertext and wrapped DEK strings
  @Column({ name: 'api_key_ciphertext', type: 'text' })
  apiKeyCiphertext!: string;

  @Column({ name: 'api_key_dek_wrapped', type: 'text' })
  apiKeyDekWrapped!: string;

  @Column({ name: 'last_active_at', type: TIMESTAMP_COLUMN_TYPE, nullable: true })
  lastActiveAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: TIMESTAMP_COLUMN_TYPE })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: TIMESTAMP_COLUMN_TYPE })
  updatedAt!: Date;
}
