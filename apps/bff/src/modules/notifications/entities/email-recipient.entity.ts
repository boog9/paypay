import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { StoreBinding } from "../../stores/entities/store-binding.entity";

@Entity({ name: "email_recipients" })
export class EmailRecipient {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  email!: string;

  @ManyToOne(() => StoreBinding, { nullable: false })
  @JoinColumn({ name: "store_id" })
  store!: StoreBinding;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
