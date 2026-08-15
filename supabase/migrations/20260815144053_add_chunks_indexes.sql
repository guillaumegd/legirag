create index if not exists idx_chunks_embedding_hnsw
  on chunks using hnsw (embedding extensions.vector_cosine_ops);

create index if not exists idx_chunks_tsv
  on chunks using gin (tsv);

create index if not exists idx_articles_etat on articles (etat);

create index if not exists idx_articles_code_slug_dates
  on articles (code_slug, date_debut, date_fin);
