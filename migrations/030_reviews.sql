-- Product reviews are comments with stars; «verified» when the address bought the product.
alter table comments add column rating smallint check (rating between 1 and 5);
alter table comments add column verified boolean not null default false;
create index comments_rated_idx on comments (entry_id) where rating is not null and status = 'approved';
