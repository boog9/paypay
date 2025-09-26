import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique
} from "typeorm";
import { User } from "../../auth/entities/user.entity";
import { Organization } from "./organization.entity";

@Entity({ name: "memberships" })
@Unique(["user", "organization"])
export class Membership {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => User, (user) => user.memberships, { eager: true })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @ManyToOne(() => Organization, (organization) => organization.memberships, { eager: true })
  @JoinColumn({ name: "organization_id" })
  organization!: Organization;

  @Column({ default: "owner" })
  role!: "owner" | "member";

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
