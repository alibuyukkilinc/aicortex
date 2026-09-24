---
id: 01M39ZZZNEKPFG9B798RFK18MR
author: ai-agent
created_at: 2026-09-24T15:19:24.590Z
status_change:
  from: open
  to: closed
fields:
  resolution: fixed
  commits:
    - f1e095f
  files:
    - src/api/routes.ts
    - web/src/App.tsx
    - test/approvals.test.ts
    - test/hub.test.ts
    - CHANGELOG.md
---

Düzeltildi: rozetler için tek uç, `GET /counts` → `{ inbox, approvals, stale }`.

- `src/api/routes.ts`: yeni uç, listelerin kullandığı görünürlük filtrelerinin aynısını kullanıyor (taslak filtresi ortak bir yardımcıya taşındı, `/approvals` ile birebir aynı kural). Eskimiş sayısı yine yalnızca eyleme değer olanlar (yüksek + orta, ertelenmemiş).
- `web/src/App.tsx`: kenar çubuğu üç `useApi` yerine tek `useApi("/api/counts")` kullanıyor. Listeleri gösteren sayfalar (Onaylar, Eskimiş bilgi, Bildirimler) kendi verilerini açıkken çekmeye devam ediyor.

Ölçüm (14 bekleyen taslakla, gerçek sunucuya inject ederek): **3 istek / 5.856 bayt → 1 istek / 75 bayt (%99 azalma)**. Çalışan panoda doğruladım: `/counts` `{"inbox":2,"approvals":0,"stale":6}` dönüyor, eski üç çağrının verdiği sayılarla birebir aynı.

Testler: `test/approvals.test.ts` içinde yeni bir test (sayılar doğru mu + cevap listenin dörtte birinden küçük mü), `test/hub.test.ts` içinde kısıtlı üyenin kendi görebildiğini sayması. Tüm takım yeşil: 149 test.
