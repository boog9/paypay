import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { RefreshTokenEntity } from './refresh-token.entity';
import { normalizeEmail } from '../email.utils';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 320, unique: true })
  email!: string;

  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => RefreshTokenEntity, (token) => token.user)
  refreshTokens!: RefreshTokenEntity[];

  @BeforeInsert()
  normalizeEmailBeforeInsert(): void {
    this.email = normalizeEmail(this.email);
  }
}
