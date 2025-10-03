import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { TIMESTAMP_COLUMN_TYPE } from '../../database/utils/column-types';
import { RefreshTokenEntity } from './refresh-token.entity';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 320, unique: true })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ name: 'btcpay_user_id', type: 'varchar', length: 64, nullable: true, unique: true })
  btcpayUserId!: string | null;

  @Column({ name: 'btcpay_api_key_label', type: 'varchar', length: 128, nullable: true })
  btcpayApiKeyLabel!: string | null;

  @Column({ name: 'btcpay_api_key_hash', type: 'varchar', length: 255, nullable: true })
  btcpayApiKeyHash!: string | null;

  @Column({ name: 'btcpay_api_key_permissions', type: 'text', nullable: true })
  btcpayApiKeyPermissions!: string | null;

  @CreateDateColumn({ name: 'created_at', type: TIMESTAMP_COLUMN_TYPE })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: TIMESTAMP_COLUMN_TYPE })
  updatedAt!: Date;

  @OneToMany(() => RefreshTokenEntity, (token) => token.user)
  refreshTokens!: RefreshTokenEntity[];

}
