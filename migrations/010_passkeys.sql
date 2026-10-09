-- Passkeys (WebAuthn) for the admin: phishing-proof sign-in without a password.
create table passkeys (
  id text primary key,                     -- credential ID, base64url
  user_id uuid not null references users on delete cascade,
  public_key bytea not null,               -- COSE key
  counter bigint not null default 0,
  transports text[] not null default '{}',
  name text not null default '',
  backed_up boolean not null default false,  -- synced passkey (iCloud, Google, 1Password …)
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index passkeys_user_idx on passkeys (user_id);
