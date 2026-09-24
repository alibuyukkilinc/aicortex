---
kind: node
target: backend
proposed_by: ai-agent
reason: be7ccd7 ve c735ada cortex.ts'te brief'e open_elsewhere ve boş proje için
  next adımı ekledi; arka uç özeti (tek çekirdek, ince REST/MCP/CLI, dosyalar
  asıl veri) hâlâ doğru.
base_rev: aa62dd58
id: 01M39B8ZZHYSSZPE0TVEEY59VM
proposed_at: 2026-09-24T09:17:19.729Z
data:
  path: backend
  title: Arka uç
  summary: Node 22.16+ ve TypeScript 7. Tek bir Cortex çekirdek sınıfı var; REST
    (Fastify), MCP (stdio ve HTTP) ve CLI onun üstünde ince katmanlar. Asıl veri
    dosyalar, SQLite yalnızca yeniden kurulabilen önbellek.
  links:
    code:
      - file: src/core/cortex.ts
  verified_at_commit: c735ada9d0d8a0748942dd39eaaa969bd9e8d5a6
  id: 01M34Q1CBCMK0W5QXHSQAY5PHG
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-24T09:17:19.723Z
---

İki çalışma biçimi var: `cortexboard start` tek projeyi yalnızca localhost'ta sunar (`src/api/server.ts`, pano oturumları `src/api/sessions.ts`), `cortexboard hub start` çok projeyi ekip için sunar (`src/hub`). İkisi de aynı proje rotalarını kullanır (`src/api/routes.ts`).

Her iş `Cortex` sınıfından geçer (`src/core/cortex.ts`): okuma, düğüm yazma, taslak ve onay (onayda HEAD'e yeniden sabitleme), kurallar, arama, doğrulama.
Kalemler, aktivite ve eskime için ayrı servisler var (`ItemService`, `ActivityService`, `StalenessService`), çekirdeğe bağlılar. Kalem ekleri `ItemService.attach/detach` üzerinden geçer.

Her yazımdan sonra `cortex.events` üzerinde `change` olayı yayılır. Web pano bunu canlı akışla (SSE, proje başına en fazla 50) alır, anlamla arama indeksi de bu olayda güncellenir.
`cortex.watch()` dosyalar elle değişince, git pull sonrasında veya başka bir süreç yazınca (ör. API'nin yanında çalışan MCP) indeksi kayıt düzeyinde yeniler (`src/core/sync.ts`). Ayrıca git HEAD'i 5 saniyede bir kontrol eder.
Açılışta indeks hâlâ baştan kurulur (`reindex()` kurucuda); ayrıntı `backend/index-search`.
