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
verified_at_commit: 4286d44b16a1e5a8ee46681a64ba1e3d593809d0
id: 01M34QY9R9NE0TTWX5ZP3R74J1
status: active
updated_by: ai-agent
updated_at: 2026-09-22T14:53:23.085Z
---

- Rotalar `buildServer` içinde (`src/api/server.ts`); tam liste README'de.
- `GET /api/events` panonun canlı güncelleme akışı (SSE).
- Toplu onay: `POST /api/approvals/approve` `{ ids, force? }`, toplu ret: `POST /api/approvals/reject` `{ ids, reason? }`. Bazıları başarısız olsa da 200 döner, her taslak için sonucu bildirir.
- Düğüm silme: `DELETE /api/node/{yol}?reason=`, yalnızca insan. Kök, alt düğümü olan dal ve altında açık kayıt olan düğüm silinmez; 409 cevabı hangi alt düğümlerin/kayıtların engel olduğunu söyler.
- Derlenmiş panoyu `dist/web` altından sunar (kaynaktan çalışırken son build'i kullanır).
- Hata biçimi: `{ error: { code, message, hint }, _meta }`.
