import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1700000000000 implements MigrationInterface {
  name = "InitSchema1700000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        email text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        role text NOT NULL DEFAULT 'merchant',
        refresh_token_hash text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE organizations (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE memberships (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        role text NOT NULL DEFAULT 'owner',
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, organization_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE archive_flags (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        reason text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE store_bindings (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        btcpay_store_id text NOT NULL,
        api_key_ref text NOT NULL,
        store_name text NOT NULL,
        default_currency text NOT NULL,
        archive_flag_id uuid REFERENCES archive_flags(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (btcpay_store_id, organization_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE email_recipients (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        email text NOT NULL,
        store_id uuid NOT NULL REFERENCES store_bindings(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE webhook_event_logs (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        event_type text NOT NULL,
        payload jsonb NOT NULL,
        btcpay_delivery_id text NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE webhook_event_logs`);
    await queryRunner.query(`DROP TABLE email_recipients`);
    await queryRunner.query(`DROP TABLE store_bindings`);
    await queryRunner.query(`DROP TABLE archive_flags`);
    await queryRunner.query(`DROP TABLE memberships`);
    await queryRunner.query(`DROP TABLE organizations`);
    await queryRunner.query(`DROP TABLE users`);
  }
}
