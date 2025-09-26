import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "archive_flags" })
export class ArchiveFlag {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "reason", nullable: true })
  reason?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
