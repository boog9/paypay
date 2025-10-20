import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { UserEntity } from '../../src/auth/entities/user.entity';
import { RefreshTokenEntity } from '../../src/auth/entities/refresh-token.entity';
import { TenantEntity } from '../../src/tenants/entities/tenant.entity';
import { StoreEntity } from '../../src/tenants/entities/store.entity';
import { AuditLogEntity } from '../../src/tenants/entities/audit-log.entity';
import { IdempotencyKeyEntity } from '../../src/tenants/entities/idempotency-key.entity';
import { ManagedStoreEntity } from '../../src/stores/managed-store.entity';

describe('Database schema', () => {
  it('initializes an in-memory sqlite DataSource without unsupported types', async () => {
    const dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [
        UserEntity,
        RefreshTokenEntity,
        TenantEntity,
        StoreEntity,
        AuditLogEntity,
        IdempotencyKeyEntity,
        ManagedStoreEntity
      ],
      synchronize: true,
      dropSchema: true,
      logging: false
    });

    try {
      const connection = await dataSource.initialize();
      expect(connection.isInitialized).toBe(true);
    } finally {
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
    }
  });
});
