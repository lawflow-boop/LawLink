# LawLink Public Release Checklist

This checklist is for publishing LawLink as a clean open-source repository.

## What Must Not Be Published

- `.env`, `.env.local`, `.env.production`, or any real environment file.
- AI, Yuandian, AWS, database, NextAuth, storage encryption, or other API keys.
- Local PostgreSQL data, database dumps, backup folders, or restore archives.
- Local `storage/` attachments, case files, templates uploaded by users, or archive files.
- Real matters, intakes, clients, contacts, parties, fee records, invoice requests, seal requests, audit logs, notifications, or AI settings from a running instance.

## Current Repository Policy

- `.env*` is ignored except `.env.example`.
- `storage/`, `backups/`, `outputs/`, Next build output, logs, and local caches are ignored.
- `.dockerignore` excludes local data and secrets from Docker build context.
- `prisma/seed.ts` creates only baseline system data: admin account, cause samples, stage templates, system settings, document templates, and seal configs.
- Demo matters are disabled for public release.
- AI and Yuandian API keys are not hard-coded. Runtime keys are stored in the database as encrypted `SystemSetting` values and must never be committed.

## Before First GitHub Publication

1. Confirm `git status --short` only contains intentional source changes.
2. Confirm tracked files do not include local data:
   ```bash
   git ls-files | rg '^(\\.env$|\\.env\\.(local|production|development|test)|backups/|outputs/|\\.next|node_modules/)'
   git ls-files storage | rg -v '^storage/\\.gitkeep$'
   ```
   Both commands should print nothing.
3. Confirm local ignored files stay ignored:
   ```bash
   git status --ignored --short
   ```
4. Check secret-like strings by filename first:
   ```bash
   rg -n -l 'API_KEY|SECRET|TOKEN|PASSWORD|sk-|Bearer ' . -g '!node_modules' -g '!.next*' -g '!storage/**' -g '!outputs/**'
   ```
5. Run the validation chain:
   ```bash
   npm run lint
   npm run typecheck
   npm run prisma:validate
   npm run build
   ```
6. Build a clean source archive:
   ```bash
   ./scripts/create-public-archive.sh
   ```

## Local Data Reset Is Separate

Publishing to GitHub does not publish your local database or local attachments as long as ignored files are not force-added. If you want to wipe the local development database, do that only after making a private backup and confirming the action explicitly.
