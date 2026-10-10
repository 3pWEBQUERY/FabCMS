-- «Tell me when it's back»: one mail when a sold-out product (or variant) is in stock again, then the address goes.
create table restock_alerts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references entries on delete cascade,
  variant int,
  email text not null,
  lang text not null default '',
  created_at timestamptz not null default now()
);
create unique index restock_alerts_once_idx on restock_alerts (product_id, coalesce(variant, -1), lower(email));
