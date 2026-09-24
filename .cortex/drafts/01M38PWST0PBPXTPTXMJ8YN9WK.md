---
kind: node
target: backend/items-and-rules
proposed_by: ai-agent
reason: "Gözden geçirme: kalem ekleri, liste cevabındaki kart alanları ve gelen
  kutusunun SQL görünürlüğü (S6) eklendi."
base_rev: 9229f145
id: 01M38PWST0PBPXTPTXMJ8YN9WK
proposed_at: 2026-09-24T03:21:08.672Z
data:
  path: backend/items-and-rules
  title: Kalemler, şemalar ve kurallar
  summary: 'Beş hazır kalem türü var: görev, issue, soru, not, karar. Her biri
    düzenlenebilir bir rules/<tür>.schema.yaml dosyasıyla tanımlı. "Bitti" iki
    ayrı şey: terminal ve resolved. assignee ile claimed_by ayrı; if_rev ve
    claim eşzamanlı yazımı korur. Kalemler dosya eki taşır.'
  links:
    code:
      - file: src/core/items.ts
      - file: src/core/schema.ts
      - file: src/core/language.ts
      - file: src/core/types.ts
      - file: src/store/attachments.ts
  verified_at_commit: 3295916c724365d800427f9468950a5ad1f02895
  id: 01M34QY9EQ1V2FK6QYKKVTPEDB
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-24T03:21:08.664Z
---

- Varsayılanlar `DEFAULT_SCHEMAS` içinde (`src/core/schema.ts`); `init` bunları `.cortex/rules/` altına yazar.
- Bir şemada şunlar var: durumlar, başlangıç ve bitiş durumları, izinli geçişler, yalnızca insanın koyabileceği durumlar, alanlar, yanıt kuralları ve AI'a düz dille talimatlar.
- Yeni tür eklemek için `rules/<tür>.schema.yaml` dosyası bırakmak yeter.
- Kuralları yalnızca insan değiştirebilir; kaydetmeden önce denetlenir (`validateRulesDoc`), bir yazım hatası tüm yazımları bozamaz.
- `rules/_global.yaml` içindeki `language` alanı AI'ların hangi dilde yazacağını belirler; brief'te ilk kural olarak görünür.
- `rules_version` = rules/ klasörünün özeti. Her cevapta `_meta` içinde gelir; AI kuralları yalnızca bu değişince yeniden okur.
- Kalem kime atanabilir: bir aktör, `@humans` (insanlar) ya da `@ai`. Gelen kutusunda engelleyici sorular en üstte (`ItemService.inbox`); hub'da görünürlük sorgunun içinde uygulanır, `count` üyenin açabildiği sayıdır.
- `ask(about, title)` soruyu, sorulan şeyi yapan kişiye yönlendirir.
- Liste cevabı (`list`, pano kartı) kalemin özetini taşır: yanıt sayısı, ek sayısı (`files`), kapak resmi (`cover`), öncelik ya da önem (`level`), son tarih (`due`), açıklaması var mı (`has_body`). Hepsi indeksten gelir.

### "Bitti"nin iki anlamı: terminal ve resolved (`src/core/schema.ts`)
- `terminal`: bu durumdan çıkan geçiş yok. Geçiş kontrolünü ve raporlardaki "kapanan kayıt" sayımını bu belirler.
- `resolved` (isteğe bağlı): iş bitti ama kalem hâlâ hareket edebilir. Karar türü için varsayılanı `[accepted]`.
- `isOpenWork(schema, status)` = ne terminal ne resolved. Açık iş soran her yer bunu kullanır: brief'teki dal sayıları, gelen kutusu, `items?open=true`, raporlardaki açık issue'lar.
- İndekste iki bayrak birden tutulur (`terminal`, `open_work`); ikisi de kurallardan gelir, bir kural değişikliği `retermItems` ile yeniden karar verir. Tek karar noktası `Cortex.itemFlags`.
- Şema dosyasında `resolved` yoksa `loadSchema` yerleşik varsayılana düşer: eski projeler güncellemeyle düzelir.
- `codeContext` bilerek istisna yapar: kabul edilmiş kararları da döndürür.

### Görev devri: claim/release, eşzamanlılık, devir notu (`src/core/items.ts`)
- `assignee` (kime ait) ile `claimed_by`/`claimed_at` (şu an fiilen kim çalışıyor) ayrı kavramlar.
- `ItemService.claim(actor, id, { action: "claim"|"release", note?, force? })`: atomik; boşsa, aynı aktördeyse veya süresi geçmişse (2 saat, `CLAIM_TTL_MS`) başarılı; başkası tutuyorsa 409 `conflict`. Yalnızca insan `force: true` ile devralabilir.
- Claim/release her zaman direkt yazar (taslağa düşmez) ve `itemRevision()`'ı değiştirmez; bekleyen bir taslağın `base_rev`'i etkilenmez.
- `handoff_note`: claim/release ile yazılan kısa (≤500 karakter) "nereye kadar geldim" notu.
- `UpdateItemInput.if_rev`: verilirse `itemRevision(current)` ile karşılaştırılır, uyuşmazsa 409. `ItemService.get()` `rev` döndürür.

### Ekler (`ItemService.attach/detach`, `src/store/attachments.ts`)
- Dosyalar kalemin klasöründe: `items/<ULID>-<slug>/files/<ad>`. Klasör doğrunun kendisi. `get()` cevabı `attachments` listesini (ad, boyut, tür, eklenme zamanı) taşır; `itemRevision`'a girmez.
- Ad güvenli tek bir yol parçasına çevrilir ama okunur kalır; aynı ad tekrar gelirse `-2`. Dosya başına 15 MB, kalem başına 100, boş dosya reddedilir. Her ekleme/kaldırma `item.attached` / `item.detached` denetim kaydı bırakır.
- Politika: ekler taslak olamaz. AI'ın bu türe yazımları taslak olacaksa (review) ek yükleyemez/kaldıramaz; `human_only` zaten reddedilir; `auto`'da doğrudan. İnsan her zaman.
- Markdown'da `files/<ad>` aynı kalemin ekini gösterir; pano yapıştırılan ekran görüntüsünü `![..](<files/..>)` olarak ekler.
