import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateTenantSchema1727800000000 implements MigrationInterface {
  name = 'CreateTenantSchema1727800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'tenants',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'email', type: 'varchar', isUnique: true },
          { name: 'name', type: 'varchar' },
          { name: 'created_at', type: 'timestamp with time zone', default: 'now()' },
          { name: 'updated_at', type: 'timestamp with time zone', default: 'now()' }
        ]
      })
    );

    await queryRunner.createTable(
      new Table({
        name: 'stores',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'tenant_id', type: 'uuid' },
          { name: 'btcpay_host', type: 'varchar' },
          { name: 'btcpay_store_id', type: 'varchar', isUnique: true },
          { name: 'api_key_ciphertext', type: 'text' },
          { name: 'api_key_dek_wrapped', type: 'text' },
          { name: 'webhook_id', type: 'varchar' },
          { name: 'webhook_secret_ciphertext', type: 'text' },
          { name: 'webhook_secret_dek_wrapped', type: 'text' },
          { name: 'wallet_setup_status', type: 'varchar', default: "'pending'" },
          { name: 'created_at', type: 'timestamp with time zone', default: 'now()' },
          { name: 'updated_at', type: 'timestamp with time zone', default: 'now()' }
        ]
      })
    );

    await queryRunner.createForeignKey(
      'stores',
      new TableForeignKey({
        columnNames: ['tenant_id'],
        referencedTableName: 'tenants',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE'
      })
    );

    await queryRunner.createTable(
      new Table({
        name: 'audit_logs',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'tenant_id', type: 'uuid' },
          { name: 'actor_id', type: 'varchar', isNullable: true },
          { name: 'action', type: 'varchar' },
          { name: 'resource', type: 'varchar' },
          { name: 'result', type: 'varchar' },
          { name: 'ip', type: 'varchar', isNullable: true },
          { name: 'ts', type: 'timestamp with time zone', default: 'now()' }
        ]
      })
    );

    await queryRunner.createForeignKey(
      'audit_logs',
      new TableForeignKey({
        columnNames: ['tenant_id'],
        referencedTableName: 'tenants',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE'
      })
    );

    await queryRunner.createTable(
      new Table({
        name: 'idempotency_keys',
        columns: [
          { name: 'key', type: 'varchar', isPrimary: true },
          { name: 'tenant_id', type: 'uuid', isNullable: true },
          { name: 'source', type: 'varchar' },
          { name: 'resource_id', type: 'varchar', isNullable: true },
          { name: 'ts', type: 'timestamp with time zone', default: 'now()' }
        ]
      })
    );

    await queryRunner.createForeignKey(
      'idempotency_keys',
      new TableForeignKey({
        columnNames: ['tenant_id'],
        referencedTableName: 'tenants',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const idempotencyForeignKeys = await queryRunner.getTable('idempotency_keys');
    if (idempotencyForeignKeys) {
      for (const fk of idempotencyForeignKeys.foreignKeys) {
        await queryRunner.dropForeignKey('idempotency_keys', fk);
      }
    }
    await queryRunner.dropTable('idempotency_keys');

    const auditTable = await queryRunner.getTable('audit_logs');
    if (auditTable) {
      for (const fk of auditTable.foreignKeys) {
        await queryRunner.dropForeignKey('audit_logs', fk);
      }
    }
    await queryRunner.dropTable('audit_logs');

    const storesTable = await queryRunner.getTable('stores');
    if (storesTable) {
      for (const fk of storesTable.foreignKeys) {
        await queryRunner.dropForeignKey('stores', fk);
      }
    }
    await queryRunner.dropTable('stores');

    await queryRunner.dropTable('tenants');
  }
}
