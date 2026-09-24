---
title: Tartışmalar (discussion)
summary: "`discussion` kayıt türü: insanlar ve AI'lar bir soruya seçenek
  destekleyen, kanıtlı görüş yazar. Kör ilk tur, son tutum = oy, sayım çoğunluğu
  önerilen karara çevirir, kararı insan kabul eder. Mantık
  src/core/discussions.ts'te."
links:
  code:
    - file: src/core/discussions.ts
    - file: src/core/schema.ts
    - file: src/core/items.ts
    - file: src/api/routes.ts
    - file: src/mcp/server.ts
    - file: web/src/pages/Discussions.tsx
verified_at_commit: b2ffcf3274cd981a82cd0839e44e5d900cde3a64
id: 01M3AFWW60RCKHTQVV4NDAHZQ7
status: active
updated_by: ai-agent
updated_at: 2026-09-24T20:05:09.430Z
---

## Ne
Tartışma, `discussion` türünde bir kayıttır; her görüş bir yanıttır (`replies/*.md`). Ayrı depolama yok, git'te diğer kayıtlar gibi durur. Web'de panodan ayrı ekranı var (`#/discussions`, `web/src/pages/Discussions.tsx`); pano ve yeni kayıt diyaloğu bu türü göstermez.

## Aşamalar (status)
- `open`: görüş toplanıyor. `blind` (varsayılan true) ise kör tur: okuyucu, kendi `opinion`'ını yazana kadar diğerlerinin görüşlerini `sealed: true` ve boş gövdeyle alır. Tartışmayı açan kişi ve katılımcı listesi dışındaki insanlar her şeyi görür.
- `deliberating`: görüşler açık; `rebuttal` ve `synthesis` yazılabilir. Yeni bir `stance` oyu değiştirir.
- `voted`: `POST /discussions/:id/close-vote` oyları saydı. Net çoğunluk varsa `proposed` bir decision oluşur (`links.items` = tartışma, `fields.outcome` = decision). Beraberlikte decision oluşmaz.
- `decided`: decision `accepted` olunca `ItemService.update` → `DiscussionService.onDecisionAccepted` tartışmayı kapatır. `POST /discussions/:id/decide {option}` (yalnızca insan, `approve` izni) başka seçenekle karar verir; bekleyen proposed decision reddedilir.
- `voted` ve `decided` düz bir durum değişikliğiyle verilemez; yalnızca servis `internal` bayrağıyla yazar.

## Kurallar
- Yanıt alanları: `kind` (opinion | rebuttal | comment | synthesis, zorunlu), `stance` (seçeneklerden biri, birebir), `confidence`, `evidence`. `opinion` için stance + confidence + evidence zorunlu.
- `participants` doluysa yalnızca onlar (ve açan kişi) oy verir; herkes yorum yazabilir. Boşsa herkes katılır.
- Yanıt izni hub'da `ask` (sorulardaki gibi); açmak `write_items`.
- Kör turda yanıt metinleri arama indeksine (`src/index/db.ts`, `isSealed`) ve liste önizlemesine girmez.
- Gelen kutusu nedeni `discussion_needs_your_view`; `/counts` içinde `discussions` rozeti.

## MCP
`cortex_discussions`, `cortex_discuss` (görüş yaz), `cortex_close_vote`. Tartışma açmak: `cortex_create_item` type `discussion`.
