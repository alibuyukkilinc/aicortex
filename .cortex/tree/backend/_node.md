---
title: Arka uç
summary: Node 22.13+ ve TypeScript. Tek bir Cortex çekirdek sınıfı var; REST
  (Fastify), MCP (stdio) ve CLI onun üstünde ince katmanlar. Asıl veri dosyalar,
  SQLite yalnızca yeniden kurulabilen önbellek.
tags:
  - mimari
links:
  code:
    - file: src/core/cortex.ts
verified_at_commit: d974755195f2cbd8301ad42d39a41c6250682b77
id: 01M34Q1CBCMK0W5QXHSQAY5PHG
status: active
updated_by: ai-agent
updated_at: 2026-09-22T14:35:00.870Z
---

Her iş `Cortex` sınıfından geçer (`src/core/cortex.ts`): okuma, düğüm yazma, taslak ve onay, kurallar, arama.
Kalemler ve aktivite için ayrı servisler var (`ItemService`, `ActivityService`), çekirdeğe bağlılar.

Her yazımdan sonra `cortex.events` üzerinde `change` olayı yayılır. Web pano bunu canlı akışla (SSE) alır, anlamla arama indeksi de bu olayda güncellenir.
`cortex.watch()` dosyalar elle değişince, git pull sonrasında veya başka bir süreç yazınca (ör. API'nin yanında çalışan MCP) indeksi yeniler. Ayrıca git HEAD'i 5 saniyede bir kontrol eder.
