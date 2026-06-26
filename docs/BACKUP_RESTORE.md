# CartWise AI — Database Backup & Restore (INFRA-02)

Two independent layers of backup protection are used:

1. **Neon's built-in point-in-time recovery (PITR)** — continuous, no setup beyond the dashboard toggle.
2. **A scripted daily logical backup** (`scripts/backup-database.sh`) — independent of the hosting provider, so a Neon-account-level incident doesn't take out the only backup.

---

## Layer 1: Neon Point-in-Time Recovery

Neon retains a continuous history of database changes and lets you restore (via branching) to any point within the retention window, without running any script.

**Manual setup (dashboard — not automatable from this repo):**

1. Open the Neon console for the `budgetbasket` project.
2. Go to **Settings → Backup & restore**.
3. Confirm/raise the **history retention window** to at least 7 days (Neon's free tier defaults to 1 day; paid plans support up to 30 days — set it as high as the plan allows).
4. To restore: **Branches → Restore**, pick a timestamp, and Neon creates a new branch at that point in time. Point `DATABASE_URL` at the restored branch to use it, or merge it back.

This is the fastest recovery path for "I need exactly what existed 20 minutes ago" — no script required.

## Layer 2: Scripted Daily Logical Backup

`scripts/backup-database.sh` runs `pg_dump --format=custom` against `DATABASE_URL_UNPOOLED`, which works against any Postgres provider — this is the layer that survives a Neon-account-level problem.

- **Schedule:** `.github/workflows/backup.yml` runs it daily at 08:17 UTC via GitHub Actions cron, plus on-demand via the workflow's "Run workflow" button.
- **Storage:** uploaded as a GitHub Actions artifact (`db-backup-<run-id>`), retained 30 days — this requires zero additional infrastructure or credentials. For a higher-durability target, swap the upload step for `aws s3 cp` / `rclone` to an external bucket once one is provisioned (the dump file is written to `backups/*.dump` either way, so only the upload step needs to change).
- **Encryption at rest:** GitHub Actions artifacts are encrypted at rest by GitHub. If you switch to S3, enable default bucket encryption (SSE-S3 or SSE-KMS).
- **Retention:** 30 days, enforced both by the artifact's `retention-days: 30` and by the script's own `find ... -mtime +30 -delete` (relevant if you run the script outside CI, e.g. on a server with a persistent `backups/` directory).
- **Failure alerting:** if the backup step fails, the workflow opens a GitHub issue labeled `ops, priority:p1` with a link to the failed run — this is in addition to GitHub's default email notification to the workflow's actor.

### Required secret

Add `DATABASE_URL_UNPOOLED` as a repository secret (Settings → Secrets and variables → Actions) pointing at the **dedicated CartWise production database** — not the shared `neondb` database. See the warning in [DEPLOYMENT.md](./DEPLOYMENT.md) about the database-sharing incident found while building this feature.

### Running a backup manually

```bash
export DATABASE_URL_UNPOOLED="postgresql://...";
npm run db:backup
```

---

## Restore Procedure

```bash
npm run db:restore -- backups/cartwise-20260101T000000Z.dump "postgresql://...target-db..."
```

`scripts/restore-database.sh` runs `pg_restore --clean --if-exists`, which drops and recreates each object before restoring it — safe to run against an empty database, **destructive** against a database with data you want to keep. Always restore into a fresh/scratch database first unless live recovery is the explicit goal.

## Quarterly Restore Drill

To verify backups are actually restorable (not just "the job succeeded"), run this drill once per quarter:

1. Download the most recent `db-backup-*` artifact from the Actions tab, or run `npm run db:backup` locally.
2. Create a throwaway database in the same Postgres instance: `psql "$DATABASE_URL_UNPOOLED" -c "CREATE DATABASE restore_drill_<date>;"`.
3. Restore into it: `npm run db:restore -- <dump-file> "<unpooled-url-with-dbname-swapped-to-restore_drill_<date>>"`.
4. Sanity-check: row counts on `Product`, `Store`, `CartPlan` should be non-zero and roughly match production.
5. Drop the drill database: `psql "$DATABASE_URL_UNPOOLED" -c "DROP DATABASE restore_drill_<date>;"`.
6. Record the date and result (pass/fail, any issues found) wherever the team tracks ops work.

This exact drill was run while implementing this feature (2026-06-26): backed up the dedicated database, restored into a scratch database, verified 570 products and 8 stores, then dropped the scratch database. Restore took under a minute for a ~150KB dump.

---

## Related

- [RUNBOOK.md](./RUNBOOK.md) — error monitoring and incident response (INFRA-03).
- [DEPLOYMENT.md](./DEPLOYMENT.md) — environment variables and deploy process.
