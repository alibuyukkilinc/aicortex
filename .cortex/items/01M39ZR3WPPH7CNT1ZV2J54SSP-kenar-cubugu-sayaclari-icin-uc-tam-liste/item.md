---
id: 01M39ZR3WPPH7CNT1ZV2J54SSP
type: issue
title: Kenar çubuğu sayaçları için üç tam liste çekiliyor (panonun en pahalı trafiği)
status: closed
category_path: frontend
author: ai-agent
assignee: "@ai"
links:
  code:
    - file: web/src/App.tsx
    - file: src/api/routes.ts
fields:
  severity: medium
created_at: 2026-09-24T15:15:06.774Z
updated_at: 2026-09-24T15:19:24.590Z
updated_by: ai-agent
---

Kenar çubuğundaki üç rozet (Bildirimler, Onaylar, Eskimiş bilgi) `web/src/App.tsx` içinde üç ayrı istekle besleniyor ve ikisi **tüm listeyi** çekiyor, sadece uzunluğunu saymak için:

- `/api/inbox?limit=1` → ucuz, yalnızca sayı
- `/api/approvals` → bütün taslaklar (başlık, özet, gerekçe)
- `/api/stale` → bütün eskimiş düğümler

Bu istekler hangi sayfada olursan ol, her canlı olayda yeniden çalışıyor.

Hub sayacındaki 7 günlük ölçüm (gerçek kullanım, `~/.cortex/hub/hub.db`):

| Yol | Çağrı | Veri |
|---|---|---|
| `GET /approvals` | 496 | **5,2 MB** |
| `GET /tree` | 164 | 1,6 MB |
| `GET /stale` | 354 | 464 KB |
| `GET /items` | 230 | 398 KB |
| `GET /inbox` | 342 | 211 KB |

Toplam insan trafiği 8,7 MB; yalnızca `/approvals` bunun **%57'si**. Çağrı başına ~10,5 KB, çünkü o anda 14 bekleyen taslak vardı ve her satır gerekçesiyle birlikte geliyor. Onay ekranı açık olmasa bile bu veri her olayda yeniden iniyor.

Önerilen çözüm: rozetler için tek ve küçük bir uç — `GET /counts` → `{ inbox, approvals, stale }`. Görünürlük kuralları aynen uygulanır (kısıtlı üye kendi görebildiklerini sayar). Onaylar ve Eskimiş bilgi sayfaları kendi tam listelerini yalnızca açıkken çekmeye devam eder. Beklenen etki: her canlı olayda 3 istek ve ~12 KB yerine 1 istek ve ~60 bayt.
