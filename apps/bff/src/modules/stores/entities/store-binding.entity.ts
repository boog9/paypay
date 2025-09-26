import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn
} from "typeorm";
import { Organization } from "../../organizations/entities/organization.entity";
import { ArchiveFlag } from "./archive-flag.entity";

@Entity({ name: "store_bindings" })
@Unique(["btcpayStoreId", "organization"])
export class StoreBinding {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Organization, (organization) => organization.stores)
  @JoinColumn({ name: "organization_id" })
  organization!: Organization;

  @Column({ name: "btcpay_store_id" })
  btcpayStoreId!: string;

  @Column({ name: "api_key_ref" })
  apiKeyRef!: string;

  @Column({ name: "store_name" })
  storeName!: string;

  @Column({ name: "default_currency" })
  defaultCurrency!: string;

  @ManyToOne(() => ArchiveFlag, { nullable: true })
  @JoinColumn({ name: "archive_flag_id" })
  archiveFlag?: ArchiveFlag | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
