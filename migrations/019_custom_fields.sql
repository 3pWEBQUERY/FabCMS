-- Own fields on built-in content types (Beiträge, Produkte …): kept apart from the
-- code-defined fields, so an update of Nova never overwrites them.
alter table collections add column custom_fields jsonb not null default '[]';
