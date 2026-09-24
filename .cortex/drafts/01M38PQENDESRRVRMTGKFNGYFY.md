---
kind: node
target: frontend/i18n
proposed_by: ai-agent
reason: "Kontrol edildi: i18n.ts'e yalnızca yeni anahtarlar (eskime, ekler,
  pano, kılavuz metinleri) eklendi ve biçim değişti. useLabels
  (status/type/field/value/hint/description/role/action), GLOSSARY, cortex.lang
  saklama ve iki sözlük kuralı aynen geçerli."
base_rev: 75de80ab
id: 01M38PQENDESRRVRMTGKFNGYFY
proposed_at: 2026-09-24T03:18:13.421Z
data:
  path: frontend/i18n
  title: Çeviriler
  summary: "web/src/i18n.ts: en ve tr sözlükleri (aynı anahtarlar, useT).
    useLabels() hazır durum, tür, alan, seçenek ve şema açıklamalarını çevirir;
    projenin kendi tanımladıkları adıyla kalır. Tarih ve sayılar arayüz diliyle
    biçimlenir."
  tags:
    - ceviri
  links:
    code:
      - file: web/src/i18n.ts
  verified_at_commit: 3295916c724365d800427f9468950a5ad1f02895
  id: 01M34QYA3MS8EQE6Z7H4DTATJJ
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-24T03:18:13.419Z
---

- Her yeni anahtarı hem `en` hem `tr` sözlüğüne ekle; TypeScript anahtar listesini `en`'den çıkarır.
- `useLabels()`: `status("backlog")` → "Bekleyen", `type("task")` → "Görev", `field("priority")` → "Öncelik", `value("high")` → "Yüksek", `hint(...)` ve `description(type, text)`. Açıklama yalnızca hazır metinle birebir aynıysa çevrilir; proje kendi metnini yazdıysa o gösterilir. Bilinmeyen değerler olduğu gibi kalır (serbest metin bozulmasın).
- `GLOSSARY`: İngilizce kalan terimlerin (MCP, commit, draft, stale, token, scope…) iki dilde açıklaması; hem ipuçları hem Kılavuz sayfası aynı kaynağı kullanır.
- Eylem adları: `action("code_change")` → "Kod değişikliği".
- Roller: `role("owner")` → "Sahip", `role("contributor")` → "Katkıcı".
- Tarihler: `2026-09-23` gibi alanlar "23 Eylül 2026" olarak gösterilir.
- Seçilen dil tarayıcıda saklanır (`cortex.lang`); erişim engelliyse sayfa yine çalışır.
- Bu, panonun arayüz dilidir. AI'ın Cortex'e hangi dilde yazacağı ayrı bir kuraldır (`rules/_global.yaml` → `language`).
