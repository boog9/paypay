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
import { TIMESTAMP_COLUMN_TYPE } from '../../database/utils/column-types';
import { ManagedStoreEntity } from '../../stores/managed-store.entity';

@Entity({ name: 'managed_store_wallets' })
@Unique('uq_wallet_store_payment_method', ['storeId', 'paymentMethodId'])
export class ManagedStoreWalletEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('ix_wallet_store_id')
  @Column({ name: 'store_id', type: 'uuid' })
  storeId!: string;

  @ManyToOne(() => ManagedStoreEntity, (store) => store.wallets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'store_id' })
  store!: ManagedStoreEntity;

  @Column({ name: 'payment_method_id', type: 'varchar', length: 64 })
  paymentMethodId!: string;

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
}
