import pg from 'pg';
const { Client } = pg;

const client = new Client({
  host: 'db.fkmvsmutslfypniruyye.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'Vy8QFrYrXX7HRWAh',
  ssl: { rejectUnauthorized: false },
});

const indexes = [
  {
    name: 'idx_notifications_user_created',
    sql: `CREATE INDEX IF NOT EXISTS idx_notifications_user_created
      ON notifications (user_id, created_at DESC);`,
    description: 'Notificaciones: cursor-based pagination (user + order)',
  },
  {
    name: 'idx_notifications_user_type_created',
    sql: `CREATE INDEX IF NOT EXISTS idx_notifications_user_type_created
      ON notifications (user_id, type, created_at DESC);`,
    description: 'Notificaciones: filtro tipo + cursor',
  },
  {
    name: 'idx_promotions_name',
    sql: `CREATE INDEX IF NOT EXISTS idx_promotions_name
      ON promotions USING gin (name gin_trgm_ops);`,
    description: 'Promociones: busqueda por nombre (GIN trgm)',
  },
  {
    name: 'idx_branches_name',
    sql: `CREATE INDEX IF NOT EXISTS idx_branches_name
      ON branches USING gin (name gin_trgm_ops);`,
    description: 'Branches: busqueda por nombre (GIN trgm)',
  },
  {
    name: 'idx_approval_requests_tenant_status_created',
    sql: `CREATE INDEX IF NOT EXISTS idx_approval_requests_tenant_status_created
      ON approval_requests (tenant_id, status, created_at DESC);`,
    description: 'Approval requests: paginacion por tenant + status + fecha',
  },
  {
    name: 'idx_leave_requests_tenant_created',
    sql: `CREATE INDEX IF NOT EXISTS idx_leave_requests_tenant_created
      ON leave_requests (tenant_id, created_at DESC);`,
    description: 'Leave requests: paginacion',
  },
  {
    name: 'idx_audit_log_resource',
    sql: `CREATE INDEX IF NOT EXISTS idx_audit_log_resource
      ON audit_log (resource, resource_id);`,
    description: 'Audit log: consultas por resource',
  },
];

async function main() {
  try {
    await client.connect();
    console.log('Connected to Supabase PostgreSQL.\n');

    // Step 1: Ensure pg_trgm extension is enabled
    console.log('--- Checking pg_trgm extension ---');
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
      console.log('pg_trgm extension: OK (enabled)\n');
    } catch (err) {
      console.error('FAILED to enable pg_trgm extension:', err.message);
      console.error('GIN trgm indexes will fail without this extension.\n');
    }

    // Step 2: Create each index
    let successCount = 0;
    let failCount = 0;

    for (const index of indexes) {
      console.log(`--- ${index.description} ---`);
      console.log(`Index: ${index.name}`);
      try {
        const result = await client.query(index.sql);
        console.log(`Result: SUCCESS (command: ${result.command})`);
        successCount++;
      } catch (err) {
        console.log(`Result: FAILED - ${err.message}`);
        failCount++;
      }
      console.log('');
    }

    console.log('='.repeat(50));
    console.log(`Summary: ${successCount} succeeded, ${failCount} failed out of ${indexes.length} indexes.`);
  } catch (err) {
    console.error('Connection error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\nConnection closed.');
  }
}

main();
