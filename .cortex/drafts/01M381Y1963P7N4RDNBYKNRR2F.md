---
kind: node
target: backend/rest-api
proposed_by: ai-agent
reason: S3 (eskime uçları), S5 (trustProxy) ve S6 (SQL görünürlüğü, SSE sınırı)
  düğümün anlattığını değiştirdi.
base_rev: b78b9dcd
id: 01M381Y1963P7N4RDNBYKNRR2F
proposed_at: 2026-09-23T21:14:48.998Z
data:
  path: backend/rest-api
  title: REST API
  summary: Proje rotaları src/api/routes.ts'de; tek projede /api altında (Bearer
    token veya pano oturumu, yalnızca localhost), hub'da /api/p/:project altında
    (e-posta+şifre oturumu veya ajan tokenı) sunulur. Hub'da her rota rol
    yetkisini ve görünürlüğü denetler; liste görünürlüğü SQL'de.
  links:
    code:
      - file: src/api/routes.ts
      - file: src/api/server.ts
      - file: src/api/access.ts
      - file: src/hub/access.ts
  verified_at_commit: 35fe3da
  id: 01M34QY9R9NE0TTWX5ZP3R74J1
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-23T21:14:48.992Z
---

- Rotalar `projectRoutes` içinde (`src/api/routes.ts`); `req.cortex` projeyi, `req.access` (yalnızca hub) rolü taşır. `need(req, perm)` yetkisi olmayanı 403 ile durdurur; gizli kayıtlar 404 döner. Tek proje sunucusu `buildServer`, ortak parçalar `baseServer` (`src/api/server.ts`, hub için `trustProxy` seçeneğiyle).
- Görünürlük: `Access.seesItem` (bellekte) ve `Access.itemSql()` (aynı kural, items tablosu üzerinde SQL parçası; herkes görüyorsa null). `/items`, `/inbox` ve brief'in gelen kutusu SQL parçasını `queryItems`'a geçirir; süzme LIMIT/OFFSET'ten ÖNCE olur, sayfalar dolu ve `total`/`count` doğru gelir. İki yazım `test/scoped-pagination.test.ts`'te birbirine karşı denetlenir. Arama, taslaklar, aktivite ve kod bağlamı hâlâ sonradan süzülür (sayfalı değiller ya da sıralama puanına bağlılar).
- `GET /api/events` panonun canlı güncelleme akışı (SSE). Proje başına en fazla 50 akış (`CORTEX_SSE_LIMIT`), fazlası 503 + `Retry-After: 30`. Dinleyici sınırı buna göre ayarlı; akış kapanınca ya da hata verince bir kez temizlenir.
- Toplu onay: `POST /api/approvals/approve` `{ ids, force?, verify_at_head? }`, toplu ret: `POST /api/approvals/reject` `{ ids, reason? }`. Bazıları başarısız olsa da 200 döner, her taslak için sonucu bildirir.
- Eskime: `GET /api/stale` (`actionable` sayısı + düğümler, derece ve başlıkla), `POST /api/verify/{yol}`, `POST /api/verify` `{ paths }`, `POST|DELETE /api/snooze/{yol}` (yalnızca insan).
- Düğüm silme: `DELETE /api/node/{yol}?reason=`, yalnızca insan. Kök, alt düğümü olan dal ve altında açık kayıt olan düğüm silinmez; 409 cevabı hangi alt düğümlerin/kayıtların engel olduğunu söyler.
- Derlenmiş panoyu `dist/web` altından sunar (kaynaktan çalışırken son build'i kullanır). Dosyalar her istekte aranır (`wildcard: true`), böylece sunucu açıkken yeniden derlenen pano yeniden başlatmadan gelir. Uzantısız yollar (ör. `/knowledge/x`) panonun sayfasına düşer; bulunamayan dosya (ör. `/assets/x.js`) 404 döner.
- Hata çevirici ortak (`setErrorHandler`): tek proje sunucusu, merkez ve MCP'nin yerel katmanı aynı hata biçimini kullanır.
- Hata biçimi: `{ error: { code, message, hint }, _meta }`.
