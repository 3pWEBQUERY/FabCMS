-- Language of the admin interface per person; '' = follow the browser.
alter table users add column ui_lang text not null default '' check (ui_lang in ('', 'de', 'fr', 'it', 'en'));
