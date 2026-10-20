-- G6: kütüphane ve RAG. Doküman (kaynak künyesiyle) ve parçalar (sayfa atıflı, gömmeli).
-- Kural 6: kaynak + tarih + sürüm + lisans notu olmadan doküman girilemez (NOT NULL + CHECK).

CREATE TABLE library_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title          text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  publisher      text NOT NULL CHECK (length(btrim(publisher)) BETWEEN 1 AND 160),
  source_date    date NOT NULL,
  source_version text NOT NULL CHECK (length(btrim(source_version)) BETWEEN 1 AND 60),
  source_url     text CHECK (source_url IS NULL OR length(source_url) <= 500),
  license_note   text NOT NULL CHECK (length(btrim(license_note)) BETWEEN 1 AND 300),
  -- Yükleyenin bildirdiği düzey. "Uzman onaylı" düzeyi yalnız onayla kazanılır (aşağıda).
  tier           text NOT NULL CHECK (tier IN ('kurum', 'genel')),
  review_status  text NOT NULL DEFAULT 'taslak-uzman-onayi-bekliyor'
                 CHECK (review_status IN ('taslak-uzman-onayi-bekliyor', 'uzman-onayli')),
  page_count     int NOT NULL CHECK (page_count >= 1),
  content_hash   text NOT NULL UNIQUE,
  embedder       text NOT NULL,
  uploaded_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE library_chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES library_documents(id) ON DELETE CASCADE,
  seq         int NOT NULL,
  page        int NOT NULL CHECK (page >= 1),
  content     text NOT NULL CHECK (length(btrim(content)) >= 1),
  embedding   real[] NOT NULL,
  UNIQUE (document_id, seq)
);
CREATE INDEX library_chunks_doc_idx ON library_chunks(document_id);

-- pgvector varsa (üretim imajı) vektör sütunu + HNSW dizini eklenir; yoksa arama real[] ile TS'de yapılır.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;
    ALTER TABLE library_chunks ADD COLUMN embedding_vec vector(512);
    CREATE INDEX library_chunks_vec_idx ON library_chunks USING hnsw (embedding_vec vector_cosine_ops);
  END IF;
END $$;

CREATE TRIGGER audit_library_documents AFTER INSERT OR UPDATE OR DELETE ON library_documents
  FOR EACH ROW EXECUTE FUNCTION audit_row();
-- Parçalar belgeden türetilir; denetim doküman satırında tutulur (gömme dizisini günlüğe yazmamak için).

ALTER TABLE library_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY lib_doc_select ON library_documents FOR SELECT TO tp_app USING (app_user_id() IS NOT NULL);
CREATE POLICY lib_doc_insert ON library_documents FOR INSERT TO tp_app
  WITH CHECK (
    (app_has_role('institution_admin') OR app_has_role('expert') OR app_has_role('admin'))
    AND uploaded_by = app_user_id()
    AND review_status = 'taslak-uzman-onayi-bekliyor'
  );
CREATE POLICY lib_doc_review ON library_documents FOR UPDATE TO tp_app
  USING (app_has_role('expert') OR app_has_role('admin'))
  WITH CHECK (reviewed_by = app_user_id());
GRANT SELECT, INSERT ON library_documents TO tp_app;
GRANT UPDATE (review_status, reviewed_by) ON library_documents TO tp_app;

CREATE POLICY lib_chunk_select ON library_chunks FOR SELECT TO tp_app USING (app_user_id() IS NOT NULL);
-- Parça yalnız kendi yüklediği dokümana eklenir.
CREATE POLICY lib_chunk_insert ON library_chunks FOR INSERT TO tp_app
  WITH CHECK (EXISTS (SELECT 1 FROM library_documents d
                      WHERE d.id = document_id AND d.uploaded_by = app_user_id()));
GRANT SELECT, INSERT ON library_chunks TO tp_app;
