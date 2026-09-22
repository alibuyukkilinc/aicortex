---
title: REST API
summary: Fastify, yalnızca 127.0.0.1. Bearer token ile ya da panonun oturum
  çerezi + CSRF başlığıyla. Her cevapta _meta.rules_version var; hatalar kod,
  mesaj ve ihlal edilen kuralla doğru örneği içeren bir ipucu taşır.
tags:
  - api
links:
  code:
    - file: src/api/server.ts
verified_at_commit: d974755195f2cbd8301ad42d39a41c6250682b77
id: 01M34QY9R9NE0TTWX5ZP3R74J1
status: active
updated_by: ai-agent
updated_at: 2026-09-22T14:35:00.939Z
---

- Rotalar `buildServer` içinde (`src/api/server.ts`); tam liste README'de.
- `GET /api/events` panonun canlı güncelleme akışı (SSE).
- Toplu onay: `POST /api/approvals/approve` `{ ids, force? }`, toplu ret: `POST /api/approvals/reject` `{ ids, reason? }`. Bazıları başarısız olsa da 200 döner, her taslak için sonucu bildirir.
- Derlenmiş panoyu `dist/web` altından sunar (kaynaktan çalışırken son build'i kullanır).
- Hata biçimi: `{ error: { code, message, hint }, _meta }`.
