---
title: Kalemler, şemalar ve kurallar
summary: "Beş hazır kalem türü var: görev, issue, soru, not, karar. Her biri
  düzenlenebilir bir rules/<tür>.schema.yaml dosyasıyla tanımlı. Cortex
  alanları, durum geçişlerini ve yanıtları denetler; kural ihlalinde doğru
  örneği de gösterir."
tags:
  - kalemler
  - kurallar
links:
  code:
    - file: src/core/items.ts
    - file: src/core/schema.ts
    - file: src/core/language.ts
verified_at_commit: d974755195f2cbd8301ad42d39a41c6250682b77
id: 01M34QY9EQ1V2FK6QYKKVTPEDB
status: active
updated_by: ai-agent
updated_at: 2026-09-22T14:35:00.915Z
---

- Varsayılanlar `DEFAULT_SCHEMAS` içinde (`src/core/schema.ts`); `init` bunları `.cortex/rules/` altına yazar.
- Bir şemada şunlar var: durumlar, başlangıç ve bitiş durumları, izinli geçişler, yalnızca insanın koyabileceği durumlar, alanlar, yanıt kuralları ve AI'a düz dille talimatlar.
- Yeni tür eklemek için `rules/<tür>.schema.yaml` dosyası bırakmak yeter.
- Kuralları yalnızca insan değiştirebilir; kaydetmeden önce denetlenir (`validateRulesDoc`), bir yazım hatası tüm yazımları bozamaz.
- `rules/_global.yaml` içindeki `language` alanı AI'ların hangi dilde yazacağını belirler; brief'te ilk kural olarak görünür.
- `rules_version` = rules/ klasörünün özeti. Her cevapta `_meta` içinde gelir; AI kuralları yalnızca bu değişince yeniden okur.
- Kalem kime atanabilir: bir aktör, `@humans` (insanlar) ya da `@ai`. Gelen kutusunda engelleyici sorular en üstte (`ItemService.inbox`).
- `ask(about, title)` soruyu, sorulan şeyi yapan kişiye yönlendirir.
