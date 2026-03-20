import pg from "pg";
const { Client } = pg;

const client = new Client({
  host: "db.fkmvsmutslfypniruyye.supabase.co",
  port: 5432,
  database: "postgres",
  user: "postgres",
  password: "Vy8QFrYrXX7HRWAh",
  ssl: { rejectUnauthorized: false },
});

async function run() {
  await client.connect();
  console.log("Connected to Supabase Postgres");

  // 1a. Improve fn_decrement_stock with advisory locks + return value
  console.log("1a. Replacing fn_decrement_stock...");
  await client.query(`DROP FUNCTION IF EXISTS fn_decrement_stock(UUID, INT);`);
  await client.query(`
    CREATE FUNCTION fn_decrement_stock(p_product_id UUID, p_quantity INT)
    RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE current_stock INTEGER;
    BEGIN
      PERFORM pg_advisory_xact_lock(hashtext(p_product_id::TEXT));
      SELECT stock_quantity INTO current_stock
        FROM products WHERE id = p_product_id FOR UPDATE;
      IF current_stock IS NULL THEN RETURN -1; END IF;
      IF current_stock < p_quantity THEN RETURN -2; END IF;
      UPDATE products SET stock_quantity = stock_quantity - p_quantity, updated_at = NOW()
        WHERE id = p_product_id AND type = 'product';
      RETURN current_stock - p_quantity;
    END; $$;
  `);
  console.log("   Done. Returns: remaining (>=0), -1 (not found), -2 (insufficient)");

  // 1b. Add allow_offline_product_sales to fact_config
  console.log("1b. Adding allow_offline_product_sales to fact_config...");
  await client.query(`
    ALTER TABLE fact_config ADD COLUMN IF NOT EXISTS allow_offline_product_sales BOOLEAN NOT NULL DEFAULT true;
  `);
  console.log("   Done.");

  // 1c. Add products to Realtime publication
  console.log("1c. Adding products to supabase_realtime publication...");
  const { rows } = await client.query(`
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'products';
  `);
  if (rows.length === 0) {
    await client.query(`ALTER PUBLICATION supabase_realtime ADD TABLE products;`);
    console.log("   Added products to supabase_realtime.");
  } else {
    console.log("   Already in publication, skipped.");
  }

  // 1d. Index for sync incremental
  console.log("1d. Creating idx_products_tenant_updated...");
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_products_tenant_updated ON products(tenant_id, updated_at);
  `);
  console.log("   Done.");

  // Verify
  console.log("\n--- Verification ---");
  const fnCheck = await client.query(`
    SELECT prorettype::regtype AS return_type
    FROM pg_proc WHERE proname = 'fn_decrement_stock';
  `);
  console.log("fn_decrement_stock return type:", fnCheck.rows[0]?.return_type);

  const colCheck = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'fact_config' AND column_name = 'allow_offline_product_sales';
  `);
  console.log("allow_offline_product_sales exists:", colCheck.rows.length > 0);

  const pubCheck = await client.query(`
    SELECT tablename FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'products';
  `);
  console.log("products in Realtime:", pubCheck.rows.length > 0);

  const idxCheck = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE indexname = 'idx_products_tenant_updated';
  `);
  console.log("idx_products_tenant_updated exists:", idxCheck.rows.length > 0);

  await client.end();
  console.log("\nMigration complete!");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
