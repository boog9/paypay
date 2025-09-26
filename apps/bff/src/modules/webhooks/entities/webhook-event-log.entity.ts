import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "webhook_event_logs" })
@Index("uniq_webhook_delivery", ["btcpayDeliveryId"], { unique: true })
export class WebhookEventLog {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "event_type" })
  eventType!: string;

  @Column({ type: "jsonb" })
  payload!: Record<string, unknown>;

  @Column({ name: "btcpay_delivery_id" })
  btcpayDeliveryId!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
