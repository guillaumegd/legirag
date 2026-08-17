-- Item 11b - execution-trace record for GET /trace/:trace_id
-- (project-overview.md, "Execution trace"). No user scoping planned: a
-- trace is reachable by anyone holding its trace_id, the same trust model
-- ReponseStructuree.trace_id already relies on. Writes go through the same
-- privileged DATABASE_URL connection every other write in this project uses
-- (table owner bypasses RLS), so no insert policy is needed here - same
-- pattern as articles/subdivisions/chunks, whose ingestion writes also rely
-- on owner bypass rather than an insert policy.
create table if not exists traces (
  trace_id text primary key,
  question text not null,
  date_reference date not null,
  codes text[],
  steps jsonb not null,
  token_usage jsonb,
  total_duration_ms integer not null,
  created_at timestamptz not null default now()
);

alter table traces enable row level security;

create policy traces_public_read on traces for select using (true);
