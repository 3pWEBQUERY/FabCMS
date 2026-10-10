-- Every webhook delivery with its answer: what went out, what came back, and a way to send it again.
create table webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  hook_id text not null,
  event text not null,
  url text not null,
  body text not null,
  ok boolean not null default false,
  status int,
  error text,
  ms int,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index webhook_deliveries_hook_idx on webhook_deliveries (hook_id, created_at desc);
