import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
import { Membership } from "./membership.entity";
import { StoreBinding } from "../../stores/entities/store-binding.entity";

@Entity({ name: "organizations" })
export class Organization {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  name!: string;

  @OneToMany(() => Membership, (membership) => membership.organization)
  memberships!: Membership[];

  @OneToMany(() => StoreBinding, (store) => store.organization)
  stores!: StoreBinding[];

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
