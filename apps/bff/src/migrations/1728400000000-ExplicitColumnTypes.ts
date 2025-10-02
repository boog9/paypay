import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExplicitColumnTypes1728400000000 implements MigrationInterface {
  name = 'ExplicitColumnTypes1728400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "email" TYPE varchar(320) USING LEFT("email", 320)'
    );
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "password_hash" TYPE varchar(255) USING LEFT("password_hash", 255)'
    );

    await queryRunner.query(
      'ALTER TABLE "refresh_tokens" ALTER COLUMN "token_hash" TYPE varchar(255) USING LEFT("token_hash", 255)'
    );

    await queryRunner.query(
      'ALTER TABLE "tenants" ALTER COLUMN "email" TYPE varchar(320) USING LEFT("email", 320)'
    );
    await queryRunner.query(
      'ALTER TABLE "tenants" ALTER COLUMN "name" TYPE varchar(160) USING LEFT("name", 160)'
    );

    await queryRunner.query(
      'ALTER TABLE "stores" ALTER COLUMN "btcpay_host" TYPE varchar(320) USING LEFT("btcpay_host", 320)'
    );
    await queryRunner.query(
      'ALTER TABLE "stores" ALTER COLUMN "btcpay_store_id" TYPE varchar(160) USING LEFT("btcpay_store_id", 160)'
    );
    await queryRunner.query(
      'ALTER TABLE "stores" ALTER COLUMN "store_name" TYPE varchar(160) USING LEFT("store_name", 160)'
    );
    await queryRunner.query(
      'ALTER TABLE "stores" ALTER COLUMN "store_website" TYPE varchar(2048)'
    );
    await queryRunner.query(
      'ALTER TABLE "stores" ALTER COLUMN "webhook_id" TYPE varchar(160) USING LEFT("webhook_id", 160)'
    );
    await queryRunner.query(
      'ALTER TABLE "stores" ALTER COLUMN "wallet_setup_status" TYPE varchar(32) USING LEFT("wallet_setup_status", 32)'
    );
    await queryRunner.query(
      "ALTER TABLE \"stores\" ALTER COLUMN \"wallet_setup_status\" SET DEFAULT 'pending'"
    );

    await queryRunner.query(
      'ALTER TABLE "audit_logs" ALTER COLUMN "actor_id" TYPE varchar(160) USING LEFT("actor_id", 160)'
    );
    await queryRunner.query(
      'ALTER TABLE "audit_logs" ALTER COLUMN "action" TYPE varchar(160) USING LEFT("action", 160)'
    );
    await queryRunner.query(
      'ALTER TABLE "audit_logs" ALTER COLUMN "resource" TYPE varchar(160) USING LEFT("resource", 160)'
    );
    await queryRunner.query(
      'ALTER TABLE "audit_logs" ALTER COLUMN "result" TYPE varchar(32) USING LEFT("result", 32)'
    );
    await queryRunner.query(
      'ALTER TABLE "audit_logs" ALTER COLUMN "ip" TYPE varchar(64) USING LEFT("ip", 64)'
    );

    await queryRunner.query(
      'ALTER TABLE "idempotency_keys" ALTER COLUMN "key" TYPE varchar(200) USING LEFT("key", 200)'
    );
    await queryRunner.query(
      'ALTER TABLE "idempotency_keys" ALTER COLUMN "source" TYPE varchar(160) USING LEFT("source", 160)'
    );
    await queryRunner.query(
      'ALTER TABLE "idempotency_keys" ALTER COLUMN "resource_id" TYPE varchar(160) USING LEFT("resource_id", 160)'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "idempotency_keys" ALTER COLUMN "resource_id" TYPE varchar USING "resource_id"::varchar'
    );
    await queryRunner.query(
      'ALTER TABLE "idempotency_keys" ALTER COLUMN "source" TYPE varchar USING "source"::varchar'
    );
    await queryRunner.query(
      'ALTER TABLE "idempotency_keys" ALTER COLUMN "key" TYPE varchar USING "key"::varchar'
    );

    await queryRunner.query(
      'ALTER TABLE "audit_logs" ALTER COLUMN "ip" TYPE varchar USING "ip"::varchar'
    );
    await queryRunner.query(
      'ALTER TABLE "audit_logs" ALTER COLUMN "result" TYPE varchar USING "result"::varchar'
    );
    await queryRunner.query(
      'ALTER TABLE "audit_logs" ALTER COLUMN "resource" TYPE varchar USING "resource"::varchar'
    );
    await queryRunner.query(
      'ALTER TABLE "audit_logs" ALTER COLUMN "action" TYPE varchar USING "action"::varchar'
    );
    await queryRunner.query(
      'ALTER TABLE "audit_logs" ALTER COLUMN "actor_id" TYPE varchar USING "actor_id"::varchar'
    );

    await queryRunner.query(
      'ALTER TABLE "stores" ALTER COLUMN "wallet_setup_status" TYPE varchar USING "wallet_setup_status"::varchar'
    );
    await queryRunner.query(
      "ALTER TABLE \"stores\" ALTER COLUMN \"wallet_setup_status\" SET DEFAULT 'pending'"
    );
    await queryRunner.query(
      'ALTER TABLE "stores" ALTER COLUMN "webhook_id" TYPE varchar USING "webhook_id"::varchar'
    );
    await queryRunner.query(
      'ALTER TABLE "stores" ALTER COLUMN "store_website" TYPE varchar(512) USING LEFT("store_website", 512)'
    );
    await queryRunner.query(
      'ALTER TABLE "stores" ALTER COLUMN "store_name" TYPE varchar(255) USING LEFT("store_name", 255)'
    );
    await queryRunner.query(
      'ALTER TABLE "stores" ALTER COLUMN "btcpay_store_id" TYPE varchar USING "btcpay_store_id"::varchar'
    );
    await queryRunner.query(
      'ALTER TABLE "stores" ALTER COLUMN "btcpay_host" TYPE varchar USING "btcpay_host"::varchar'
    );

    await queryRunner.query(
      'ALTER TABLE "tenants" ALTER COLUMN "name" TYPE varchar USING "name"::varchar'
    );
    await queryRunner.query(
      'ALTER TABLE "tenants" ALTER COLUMN "email" TYPE varchar USING "email"::varchar'
    );

    await queryRunner.query(
      'ALTER TABLE "refresh_tokens" ALTER COLUMN "token_hash" TYPE text USING "token_hash"::text'
    );

    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "password_hash" TYPE text USING "password_hash"::text'
    );
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "email" TYPE text USING "email"::text'
    );
  }
}
