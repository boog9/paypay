import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDefaultUuidToManagedStores1730000000000 implements MigrationInterface {
  name = 'AddDefaultUuidToManagedStores1730000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
    await queryRunner.query(`
      ALTER TABLE public.managed_stores
        ALTER COLUMN id SET DEFAULT gen_random_uuid(),
        ALTER COLUMN id SET NOT NULL
    `);
    await queryRunner.query(`
      UPDATE public.managed_stores
      SET id = gen_random_uuid()
      WHERE id IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.managed_stores
        ALTER COLUMN id DROP DEFAULT
    `);
  }
}
