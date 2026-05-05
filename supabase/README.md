# Supabase Local Migration Harness

This directory is a repo-local Supabase CLI scaffold for product metadata migrations.

Current scope:

- `config.toml` is configured for local database and migration work only.
- `migrations/` contains product metadata migrations only.
- This scaffold does not link a Supabase project, apply remote migrations, or configure staging or production.

Privacy boundary:

- Supabase is for product metadata only.
- Do not add tables, buckets, functions, seeds, fixtures, or tests that store audio recordings, raw transcripts, cleaned transcript text, surrounding app context, clipboard text, local Recent Wisprs, or dictionary terms.

Command contract:

1. Start from CLI help before choosing flags:

   ```bash
   supabase --help
   supabase migration --help
   supabase migration new --help
   supabase migration list --help
   supabase migration up --help
   ```

2. Create migrations with the CLI-generated filename:

   ```bash
   supabase migration new <descriptive_name>
   ```

3. List and apply migrations against the local Supabase database only, after the local stack is running:

   ```bash
   supabase start
   supabase migration list --local
   supabase migration up --local
   ```

Production or staging commands require explicit human approval before use. Do not run `supabase link`, `supabase db push`, `supabase config push`, `supabase migration up --linked`, or any command with a live `--db-url`, project ref, access token, service-role key, or production/staging connection string from agent work.
