-- G10: pazar fiyatları. Kamusal veridir (kullanıcıya ait değil): uygulama rolü yalnız OKUR,
-- yazma yalnız sistem bağlamındaki toplayıcıdan gelir. Kaynaksız fiyat veritabanında bile tutulamaz.

CREATE TABLE market_sources (
  id               text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+$'),
  name             text NOT NULL CHECK (length(btrim(name)) > 0),
  -- Verinin çekildiği adres ve lisans/kullanım notu (kural: lisans ihlal edilmez, atıf yapılır).
  url              text,
  license_note     text NOT NULL CHECK (length(btrim(license_note)) > 0),
  robots_checked_at timestamptz,
  robots_allowed   boolean,
  crawl_delay_sec  int,
  last_fetch_at    timestamptz,
  last_status      text
);

-- Fiyatın geçerli olduğu yer. Konumu olmayan kaynak (ör. ulusal aylık rapor) "nerede satarım"a girmez.
CREATE TABLE market_places (
  id        text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+$'),
  source_id text NOT NULL REFERENCES market_sources(id),
  name      text NOT NULL CHECK (length(btrim(name)) > 0),
  province  text,
  lat       double precision CHECK (lat BETWEEN -90 AND 90),
  lon       double precision CHECK (lon BETWEEN -180 AND 180),
  -- true: koordinat il/ilçe merkezinden yaklaşıktır (kuş uçuşu mesafe de yaklaşıktır).
  approx    boolean NOT NULL DEFAULT true,
  CHECK ((lat IS NULL) = (lon IS NULL))
);

CREATE TABLE market_prices (
  id             bigserial PRIMARY KEY,
  source_id      text NOT NULL REFERENCES market_sources(id),
  place_id       text NOT NULL REFERENCES market_places(id),
  crop_id        text REFERENCES crops(id),
  product_name   text NOT NULL CHECK (length(btrim(product_name)) > 0),
  -- TL/kg (toplayıcı birimi çevirir).
  price_min      numeric(12, 4) NOT NULL CHECK (price_min > 0),
  price_max      numeric(12, 4) NOT NULL CHECK (price_max >= price_min),
  price_date     date NOT NULL,
  fetched_at     timestamptz NOT NULL,
  -- Kaynak künyesi zorunlu: sürüm, adres ve ham yanıtın özeti.
  source_version text NOT NULL CHECK (length(btrim(source_version)) > 0),
  source_url     text NOT NULL CHECK (length(btrim(source_url)) > 0),
  raw_sha256     text NOT NULL CHECK (raw_sha256 ~ '^[0-9a-f]{64}$'),
  UNIQUE (place_id, product_name, price_date)
);
CREATE INDEX market_prices_crop_idx ON market_prices(crop_id, price_date DESC) WHERE crop_id IS NOT NULL;

GRANT SELECT ON market_sources, market_places, market_prices TO tp_app;
