# Retiro de los dos scripts con credenciales de superusuario en claro

Fecha: 2026-08-08.

## Qué había

`poi-erp/scripts/` contenía dos scripts one-off, versionados en
`codeopenfounder/erp-peruonice`, con **host, usuario y contraseña del superusuario
`postgres` en texto plano**:

```js
const client = new Client({
  host: 'db.fkmvsmutslfypniruyye.supabase.co',
  port: 5432, database: 'postgres', user: 'postgres',
  password: '<redactado>',
  ssl: { rejectUnauthorized: false },
});
```

## Corrección de un dato que estaba mal documentado

`CLAUDE.md` y `docs/pendiente-notas-y-multipos.md` afirmaban que
`create-indexes.mjs` apuntaba a `fkmvsmutslfypniruyye` y `migrate-stock-sync.mjs` al
proyecto POI (`ctlvfkiwpmyljeofgitz`). **No era así**: los dos apuntaban al mismo
proyecto, `fkmvsmutslfypniruyye`, con la misma contraseña. Ninguno tocó POI.

Verificado contra la base de POI el 2026-08-08 (sondeo de solo lectura):

- `fact_config.allow_offline_product_sales` — que `migrate-stock-sync.mjs` creaba en
  el mismo run — **no existe** en `ctlvfkiwpmyljeofgitz`.
- `create-indexes.mjs` indexaba `approval_requests` y `leave_requests`, tablas que
  **no existen** en el esquema de POI.

Consecuencia práctica: el *overload* `fn_decrement_stock(uuid, int)` que el script
creaba **tampoco existe en POI**, así que la sospecha de doble *overload* ambiguo
(punto 7 de `pendiente-notas-y-multipos.md`) no aplica a este proyecto. En POI sólo
está la versión `(uuid, numeric)` de la migración `00003`.

## Qué hacía cada uno (para no perder la memoria)

**`create-indexes.mjs`** — habilitaba `pg_trgm` y creaba seis índices:
`idx_notifications_user_created`, `idx_notifications_user_type_created`,
`idx_promotions_name` (GIN trgm), `idx_branches_name` (GIN trgm),
`idx_approval_requests_tenant_status_created`, `idx_leave_requests_tenant_created`,
`idx_audit_log_resource`.

**`migrate-stock-sync.mjs`** — cuatro cambios:
1. `DROP` + `CREATE` de `fn_decrement_stock(uuid, int)` con `pg_advisory_xact_lock`,
   `SELECT ... FOR UPDATE` y códigos de retorno `-1` (no encontrado) / `-2` (stock
   insuficiente).
2. `fact_config.allow_offline_product_sales BOOLEAN NOT NULL DEFAULT true`.
3. `ALTER PUBLICATION supabase_realtime ADD TABLE products`.
4. `CREATE INDEX idx_products_tenant_updated ON products(tenant_id, updated_at)`.

Si alguno de estos cambios se quisiera en POI, va como migración numerada en
`supabase/migrations/`, no como script suelto con credenciales.

## Qué se hizo

Ambos archivos **eliminados** del repo. No se sustituyen por versiones con
`process.env.DATABASE_URL`: eran one-off ya ejecutados contra otro proyecto y no
tienen razón de existir aquí.

## Runbook pendiente (acción humana, fuera del repo)

1. **Rotar la contraseña de `postgres`** del proyecto `fkmvsmutslfypniruyye` en
   Supabase → Settings → Database → Reset database password.
2. Comprobar si `codeopenfounder/erp-peruonice` es público. Si lo es, dar la
   contraseña por comprometida con independencia de la rotación.
3. Decidir sobre el historial de git: borrar el archivo no borra los commits previos.
   Purga con `git filter-repo --path poi-erp/scripts/create-indexes.mjs --path
   poi-erp/scripts/migrate-stock-sync.mjs --invert-paths` seguido de un push forzado
   coordinado, o asumir el riesgo tras la rotación.
4. Revisar en Supabase los logs de conexión de `fkmvsmutslfypniruyye` por si hubo
   accesos ajenos.
