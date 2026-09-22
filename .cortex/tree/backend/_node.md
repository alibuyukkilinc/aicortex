---
title: Arka uç
summary: Node 22.16+ ve TypeScript. Tek bir Cortex çekirdek sınıfı var; REST
  (Fastify), MCP (stdio) ve CLI onun üstünde ince katmanlar. Asıl veri dosyalar,
  SQLite yalnızca yeniden kurulabilen önbellek.
tags:
  - mimari
links:
  code:
    - file: src/core/cortex.ts
verified_at_commit: 22cc2549d317b2e5d2c6e4dbb92b402671c7213f
id: 01M34Q1CBCMK0W5QXHSQAY5PHG
status: active
updated_by: ai-agent
updated_at: 2026-09-22T17:21:53.414Z
---

İki çalışma biçimi var: `aicortex start` tek projeyi yalnızca localhost'ta sunar (`src/api/server.ts`), `aicortex hub start` çok projeyi ekip için sunar (`src/hub`). İkisi de aynı proje rotalarını kullanır (`src/api/routes.ts`).

Her iş `Cortex` sınıfından geçer (`src/core/cortex.ts`): okuma, düğüm yazma, taslak ve onay, kurallar, arama.
Kalemler ve aktivite için ayrı servisler var (`ItemService`, `ActivityService`), çekirdeğe bağlılar.

Her yazımdan sonra `cortex.events` üzerinde `change` olayı yayılır. Web pano bunu canlı akışla (SSE) alır, anlamla arama indeksi de bu olayda güncellenir.
`cortex.watch()` dosyalar elle değişince, git pull sonrasında veya başka bir süreç yazınca (ör. API'nin yanında çalışan MCP) indeksi yeniler. Ayrıca git HEAD'i 5 saniyede bir kontrol eder.
