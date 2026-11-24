# Migrations

The application still bootstraps an idempotent baseline schema in
`server/utils/db.js` (every statement is `IF NOT EXISTS`), so a fresh install
needs no manual step.

From here on, every change that is **not** trivially idempotent belongs in a
numbered file here:

1. Add `db/migrations/0002_something.sql`.
2. Run `npm run db:migrate` (applies every file not yet recorded in the
   `schema_migrations` table, in filename order, each inside a transaction).
3. Commit the file.

Never edit an applied migration; add a new one instead.
