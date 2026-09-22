---
title: Kalemler, şemalar ve kurallar
summary: "Beş hazır kalem türü var: görev, issue, soru, not, karar. Her biri
  düzenlenebilir bir rules/&lt;tür&gt;.schema.yaml dosyasıyla tanımlı. assignee
  (kime ait) ile claimed_by (şu an kim çalışıyor) ayrı; if_rev ve claim ile
  eşzamanlı yazım koruması var."
links:
  code:
    - file: src/core/items.ts
    - file: src/core/schema.ts
    - file: src/core/language.ts
    - file: src/core/types.ts
verified_at_commit: e047112b0fd3eb0ad9a2607ed9b3c2553c72506e
id: 01M34QY9EQ1V2FK6QYKKVTPEDB
status: active
updated_by: ai-agent
updated_at: 2026-09-22T23:09:51.798Z
---

- Varsayılanlar `DEFAULT_SCHEMAS` içinde (`src/core/schema.ts`); `init` bunları `.cortex/rules/` altına yazar.
- Bir şemada şunlar var: durumlar, başlangıç ve bitiş durumları, izinli geçişler, yalnızca insanın koyabileceği durumlar, alanlar, yanıt kuralları ve AI'a düz dille talimatlar.
- Yeni tür eklemek için `rules/<tür>.schema.yaml` dosyası bırakmak yeter.
- Kuralları yalnızca insan değiştirebilir; kaydetmeden önce denetlenir (`validateRulesDoc`), bir yazım hatası tüm yazımları bozamaz.
- `rules/_global.yaml` içindeki `language` alanı AI'ların hangi dilde yazacağını belirler; brief'te ilk kural olarak görünür.
- `rules_version` = rules/ klasörünün özeti. Her cevapta `_meta` içinde gelir; AI kuralları yalnızca bu değişince yeniden okur.
- Kalem kime atanabilir: bir aktör, `@humans` (insanlar) ya da `@ai`. Gelen kutusunda engelleyici sorular en üstte (`ItemService.inbox`).
- `ask(about, title)` soruyu, sorulan şeyi yapan kişiye yönlendirir.

### Görev devri: claim/release, eşzamanlılık, devir notu (`src/core/items.ts`)
- `assignee` (kime ait, `@ai` gibi gruplar dahil) ile `claimed_by`/`claimed_at` (şu an fiilen kim çalışıyor, belirli bir aktör) ayrı kavramlar. Birden fazla AI aynı "@ai" görevine yazabildiği için, "şu an bunu ben alıyorum" demenin yolu claim.
- `ItemService.claim(actor, id, { action: "claim"|"release", note?, force? })`: atomik check-then-set. Boşsa, aynı aktördeyse veya süresi geçmişse (2 saat TTL, arka plan işi yok, okuma anında hesaplanır — `CLAIM_TTL_MS`) claim başarılı; başkası tutuyorsa 409 `conflict` (`held_by`, `since`). Yalnızca insan `force: true` ile başkasının claim'ini devralabilir. `release` yalnızca tutan tarafından (ya da insan+force) yapılabilir.
- Claim/release **her zaman direkt yazar**, `policyGate`'i (taslak onayı) atlar — koordinasyon metaverisi, incelenmesi gereken bilgi değil; taslağa düşerse "şimdi alıyorum" anlamsızlaşır.
- **Kritik:** claim/release `item.updated_at`/`updated_by`'a dokunmaz, bu yüzden `itemRevision()`'ı (title/body/status/assignee/category/fields/links/updated_at hash'i) hiç değiştirmez. Bekleyen bir içerik taslağının `base_rev`'i claim aktivitesinden etkilenmez.
- `handoff_note`: claim/release ile yazılan kısa (≤500 karakter) "nereye kadar geldim" notu. Genel `update()`'den yazılamaz — kapsamı dar, "son kontrol noktası" anlamını korur.
- `UpdateItemInput.if_rev`: isteğe bağlı, verilirse `itemRevision(current)` ile karşılaştırılır, uyuşmazsa 409 `conflict` (draft onayındaki `base_rev` deseniyle aynı `Cortex.conflict()` kullanılıyor, artık private değil). Verilmezse eski davranış (kontrolsüz, son yazan kazanır) aynen sürüyor.
- MCP: `cortex_claim` (yeni araç) ve `cortex_update_item`'a eklenen `if_rev`. REST: `POST /items/:id/claim`.
- `ItemService.get()` artık `rev: itemRevision(item)` döndürüyor; bir sonraki `if_rev`/claim'e geri verilebilir.
