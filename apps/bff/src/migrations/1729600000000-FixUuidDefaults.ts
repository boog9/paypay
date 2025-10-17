import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixUuidDefaults1729600000000 implements MigrationInterface {
  name = 'FixUuidDefaults1729600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      -- ensure pgcrypto (gen_random_uuid) is available
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      -- set DEFAULT gen_random_uuid() for any uuid id without default
      DO $do$
      DECLARE r record;
      BEGIN
        FOR r IN
          SELECT table_schema, table_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND column_name  = 'id'
            AND data_type    = 'uuid'
            AND column_default IS NULL
        LOOP
          RAISE NOTICE 'Fixing %.%...', r.table_schema, r.table_name;
          EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN id SET DEFAULT gen_random_uuid();', r.table_schema, r.table_name);
        END LOOP;
      END
      $do$;
    `);
  }

  public async down(): Promise<void> {
    // No-op: removing defaults across tables is unsafe and not required.
  }
}
