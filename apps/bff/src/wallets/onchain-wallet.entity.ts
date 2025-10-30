import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn
} from 'typeorm';
import { TIMESTAMP_COLUMN_TYPE } from '../database/utils/column-types';
import { ManagedStoreEntity } from '../stores/managed-store.entity';

@Entity({ name: 'onchain_wallets' })
@Unique('uq_onchain_wallet_store_payment_method', ['storeId', 'paymentMethodId'])
export class OnchainWalletEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('ix_onchain_wallet_store_id')
  @Column({ name: 'store_id', type: 'uuid' })
  storeId!: string;

  @ManyToOne(() => ManagedStoreEntity, (store) => store.onchainWallets, {
    onDelete: 'CASCADE',
    nullable: false
  })
  @JoinColumn({ name: 'store_id' })
  store!: ManagedStoreEntity;

  @Column({ name: 'payment_method_id', type: 'varchar', length: 64 })
  paymentMethodId!: string;

  @Column({ name: 'enabled', type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ name: 'derivation_scheme', type: 'text', nullable: true })
  derivationScheme!: string | null;

  @Column({ name: 'account_key_path', type: 'text', nullable: true })
  accountKeyPath!: string | null;

  @Column({ name: 'master_fingerprint', type: 'varchar', length: 16, nullable: true })
  masterFingerprint!: string | null;

  @Column({ name: 'label', type: 'varchar', length: 160, nullable: true })
  label!: string | null;

  @CreateDateColumn({ name: 'created_at', type: TIMESTAMP_COLUMN_TYPE })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: TIMESTAMP_COLUMN_TYPE })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: TIMESTAMP_COLUMN_TYPE, nullable: true })
  deletedAt!: Date | null;
}
