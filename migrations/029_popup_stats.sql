-- How pop-ups do: shown, clicked and closed per day. Counts only – nothing about the visitor.
create table popup_stats (
  popup_id uuid not null references entries on delete cascade,
  day date not null,
  shown int not null default 0,
  clicked int not null default 0,
  closed int not null default 0,
  primary key (popup_id, day)
);
