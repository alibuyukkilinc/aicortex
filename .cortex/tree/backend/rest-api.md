---
title: REST API
summary: Proje rotaları src/api/routes.ts'de; tek projede /api altında (Bearer
  token veya pano çerezi, yalnızca localhost), hub'da /api/p/:project altında
  (e-posta+şifre oturumu veya ajan tokenı) sunulur. Hub'da her rota rol
  yetkisini ve görünürlüğü denetler.
tags:
  - api
links:
  code:
    - file: src/api/routes.ts
    - file: src/api/server.ts
    - file: src/api/access.ts
verified_at_commit: da2b11a97658129d06087801ccfc2a5b7acf5b2f
id: 01M34QY9R9NE0TTWX5ZP3R74J1
status: active
updated_by: ai-agent
updated_at: 2026-09-22T19:28:28.272Z
---

- Rotalar `projectRoutes` içinde (`src/api/routes.ts`); `req.cortex` projeyi, `req.access` (yalnızca hub) rolü taşır. `need(req, perm)` yetkisi olmayanı 403 ile durdurur; gizli kayıtlar 404 döner. Tek proje sunucusu `buildServer`, ortak parçalar `baseServer` (`src/api/server.ts`).
- `GET /api/events` panonun canlı güncelleme akışı (SSE).
- Toplu onay: `POST /api/approvals/approve` `{ ids, force? }`, toplu ret: `POST /api/approvals/reject` `{ ids, reason? }`. Bazıları başarısız olsa da 200 döner, her taslak için sonucu bildirir.
- Düğüm silme: `DELETE /api/node/{yol}?reason=`, yalnızca insan. Kök, alt düğümü olan dal ve altında açık kayıt olan düğüm silinmez; 409 cevabı hangi alt düğümlerin/kayıtların engel olduğunu söyler.
- Derlenmiş panoyu `dist/web` altından sunar (kaynaktan çalışırken son build'i kullanır). Dosyalar her istekte aranır (`wildcard: true`), böylece sunucu açıkken yeniden derlenen pano yeniden başlatmadan gelir. Uzantısız yollar (ör. `/knowledge/x`) panonun sayfasına düşer; bulunamayan dosya (ör. `/assets/x.js`) 404 döner.
- Hata çevirici ortak (`setErrorHandler`): tek proje sunucusu, merkez ve MCP'nin yerel katmanı aynı hata biçimini kullanır.
- Hata biçimi: `{ error: { code, message, hint }, _meta }`.
