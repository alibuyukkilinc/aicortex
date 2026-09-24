---
kind: node
target: backend/rest-api
proposed_by: ai-agent
reason: "Gözden geçirme: ek uçları ve ham gövde ayrıştırıcısı eklendi."
base_rev: 93a5b878
id: 01M38PXBQT3W6Y1FBJQBK5454R
proposed_at: 2026-09-24T03:21:27.034Z
data:
  path: backend/rest-api
  title: REST API
  summary: Proje rotaları src/api/routes.ts'de; tek projede /api altında (Bearer
    token veya pano oturumu, yalnızca localhost), hub'da /api/p/:project altında
    sunulur. Hub'da her rota rol yetkisini ve görünürlüğü denetler; liste
    görünürlüğü SQL'de. Ekler ham gövdeyle yüklenir.
  links:
    code:
      - file: src/api/routes.ts
      - file: src/api/server.ts
      - file: src/api/access.ts
      - file: src/hub/access.ts
  verified_at_commit: 3295916c724365d800427f9468950a5ad1f02895
  id: 01M34QY9R9NE0TTWX5ZP3R74J1
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-24T03:21:27.021Z
---

- Rotalar `projectRoutes` içinde (`src/api/routes.ts`); `req.cortex` projeyi, `req.access` (yalnızca hub) rolü taşır. `need(req, perm)` yetkisi olmayanı 403 ile durdurur; gizli kayıtlar 404 döner. Tek proje sunucusu `buildServer`, ortak parçalar `baseServer` (`src/api/server.ts`, hub için `trustProxy` seçeneğiyle).
- Görünürlük: `Access.seesItem` (bellekte) ve `Access.itemSql()` (aynı kural, SQL parçası). `/items`, `/inbox` ve brief'in gelen kutusu SQL parçasını `queryItems`'a geçirir; süzme LIMIT/OFFSET'ten ÖNCE olur. Arama, taslaklar, aktivite ve kod bağlamı hâlâ sonradan süzülür.
- `GET /api/events` panonun canlı güncelleme akışı (SSE). Proje başına en fazla 50 akış (`CORTEX_SSE_LIMIT`), fazlası 503 + `Retry-After: 30`.
- Toplu onay: `POST /api/approvals/approve` `{ ids, force?, verify_at_head? }`, toplu ret: `POST /api/approvals/reject` `{ ids, reason? }`.
- Eskime: `GET /api/stale` (`actionable` sayısı + düğümler, derece ve başlıkla), `POST /api/verify/{yol}`, `POST /api/verify` `{ paths }`, `POST|DELETE /api/snooze/{yol}` (yalnızca insan).
- Ekler: `GET /api/items/:id/files` (liste), `POST /api/items/:id/files?name=<ad>` (gövde dosyanın kendisi, her içerik türü; bu kapsamda JSON ayrıştırıcı dahil tüm ayrıştırıcılar kaldırılıp tek bir bayt ayrıştırıcı konur, gövde sınırı 15 MB), `GET /api/items/:id/files/:ad` (`?download` indirmeye zorlar), `DELETE /api/items/:id/files/:ad`. Yazma `write_items` ister; `GET /items/:id` cevabı `attachments` taşır.
- Düğüm silme: `DELETE /api/node/{yol}?reason=`, yalnızca insan; alt düğümü ya da açık kaydı olan düğüm silinmez (409).
- Derlenmiş panoyu `dist/web` altından sunar (`wildcard: true`); uzantısız yollar panonun sayfasına düşer, bulunamayan dosya 404.
- Hata çevirici ortak (`setErrorHandler`); biçim: `{ error: { code, message, hint }, _meta }`.
