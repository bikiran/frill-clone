-- Local product index for the app's product picker.
--
-- Until now every keystroke in the picker made a live WooCommerce REST call.
-- That is slow, and it inherits WordPress search semantics, which require every
-- term to match and routinely miss a partial last word — so typing "Cichlid col"
-- did not return "Cichlid Color Food" at all.
--
-- Products are synced here the same way customers and orders already are, and
-- the picker searches this table instead. Run once in the Supabase SQL editor.

create extension if not exists pg_trgm;

create table if not exists woocommerce_products (
  company_id        uuid        not null,
  woo_product_id    bigint      not null,
  name              text        not null default '',
  sku               text        not null default '',
  type              text,
  price             text,
  regular_price     text,
  sale_price        text,
  on_sale           boolean     not null default false,
  tax_status        text,
  tax_class         text,
  stock_status      text,
  stock_quantity    integer,
  manage_stock      boolean     not null default false,
  image             text,
  permalink         text,
  short_description text,
  variation_ids     jsonb       not null default '[]'::jsonb,
  synced_at         timestamptz not null default now(),
  primary key (company_id, woo_product_id)
);

-- Trigram indexes so `ilike '%term%'` is an index scan rather than a table scan.
-- A btree index cannot serve a leading wildcard, which is exactly the shape of a
-- half-typed product name.
create index if not exists woocommerce_products_name_trgm
  on woocommerce_products using gin (name gin_trgm_ops);
create index if not exists woocommerce_products_sku_trgm
  on woocommerce_products using gin (sku gin_trgm_ops);
create index if not exists woocommerce_products_company
  on woocommerce_products (company_id);

-- Read through the service role only, same as the other WooCommerce mirrors.
alter table woocommerce_products enable row level security;
