-- Language the visitor used, so later mails (reminders, after payment, status changes) speak it too. '' = main language.
alter table bookings add column lang text not null default '';
alter table orders add column lang text not null default '';
alter table food_orders add column lang text not null default '';
alter table ticket_orders add column lang text not null default '';
alter table donations add column lang text not null default '';
