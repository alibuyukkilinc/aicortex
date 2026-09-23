---
kind: node
target: backend/storage
proposed_by: ai-agent
reason: S4 (.sessions.json), S7 (ItemStore haritası) ve S9 (merge=union)
  depolama düzenini değiştirdi.
base_rev: dccf0837
id: 01M383KJ4MJ0YK0ZBFFBAVGHF9
proposed_at: 2026-09-23T21:44:02.964Z
data:
  path: backend/storage
  title: Depolama düzeni (.cortex/)
  summary: "Her kayıt ayrı bir dosya: tree/ (bilgi düğümleri), items/ (her kalem
    bir klasör, her yanıt bir dosya), activity/<gün>/<aktör>.jsonl
    (merge=union), drafts/, rules/. Düz metin; iki klonun aynı gün yazıp
    birleştirmesi testle korunuyor."
  links:
    code:
      - file: src/store/tree.ts
      - file: src/store/items.ts
      - file: src/store/activity.ts
      - file: src/store/drafts.ts
      - file: src/store/frontmatter.ts
      - file: src/core/project.ts
  verified_at_commit: "332e687"
  id: 01M34QY98RMP56FT3WTB1B4Z09
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-23T21:44:02.958Z
---

```
.cortex/
├── cortex.config.yaml   aktörler, onay politikası, rapor saat dilimi (commit'lenir)
├── .secrets.yaml        aktör token'ları (git'e girmez, 0600)
├── .sessions.json       pano oturumlarının özetleri (git'e girmez, 0600)
├── .gitattributes       LF satır sonu + activity/**/*.jsonl merge=union
├── rules/               şemalar ve genel kurallar, yalnızca insan
├── tree/                _node.md = dal, <ad>.md = yaprak
├── items/               <ulid>-<kısa-ad>/ içinde kalem ve yanıtları
├── activity/            yalnızca eklenen JSONL, aktör başına günde bir dosya
├── drafts/              onay bekleyen AI önerileri
└── .index/              SQLite önbelleği, ertelemeler, biçim kararları (git'e girmez, silinebilir)
```
- Bir yaprağa alt düğüm eklenince kendiliğinden dala dönüşür (`TreeStore.write`); son alt düğümü silinen dal tekrar tek dosyaya döner (`TreeStore.remove`). Silinen düğüm git geçmişinde kalır.
- Yol parçaları: küçük harf, rakam ve tire (`normalizePath`).
- Kimlikler ULID: aynı anda yazan iki kişi çakışmaz.
- Aktivite: her aktörün günlük dosyası ayrı, iki kişi aynı dosyaya yazmaz. Ama aynı aktör iki makinede (aynı AI kimliği iki dizüstünde) aynı gün yazınca aynı dosyaya ekler; bu yüzden `.gitattributes` bu dosyaları `merge=union` ile birleştirir (satırlar bağımsız, kimlikleri tekil, okuyanlar kimliğe göre sıralar). `init` bunu yazar, `loadProject` eski projelere bir kez ekler. `test/parallel-merge.test.ts` iki klonla korur; kural olmadan test kırmızı.
- `ItemStore` kimlik → klasör haritasını klasörün değişim zamanı değişince bir kez yeniden kurar (eskiden her ıskalama tüm klasörü listeliyordu).
- `loadProject` açılışta ayarları denetler: geçersiz aktör adı veya bilinmeyen saat dilimi açık bir hatayla reddedilir.
