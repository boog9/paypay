import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
import { Membership } from "../../organizations/entities/membership.entity";

@Entity({ name: "users" })
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ name: "password_hash" })
  passwordHash!: string;

  @Column({ default: "merchant" })
  role!: "merchant";

  @Column({ name: "refresh_token_hash", nullable: true })
  refreshTokenHash?: string | null;

  @OneToMany(() => Membership, (membership) => membership.user)
  memberships!: Membership[];

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
