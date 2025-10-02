import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class EnhanceStoreMetadata1727900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('stores', [
      new TableColumn({
        name: 'store_name',
        type: 'varchar',
        length: '255',
        isNullable: true
      }),
      new TableColumn({
        name: 'store_website',
        type: 'varchar',
        length: '512',
        isNullable: true
      }),
      new TableColumn({
        name: 'store_key_last_four',
        type: 'varchar',
        length: '4',
        isNullable: true
      })
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('stores', 'store_key_last_four');
    await queryRunner.dropColumn('stores', 'store_website');
    await queryRunner.dropColumn('stores', 'store_name');
  }
}
