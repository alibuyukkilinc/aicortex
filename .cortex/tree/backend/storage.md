---
title: Depolama düzeni (.cortex/)
summary: "Her kayıt ayrı bir dosya: tree/ (bilgi düğümleri), items/ (her kalem
  bir klasör, her yanıt bir dosya), activity/<gün>/<aktör>.jsonl, drafts/,
  rules/. Düz metin olduğu için git farkları ve birleştirme sorunsuz."
tags:
  - depolama
  - git
links:
  code:
    - file: src/store/tree.ts
    - file: src/store/items.ts
    - file: src/store/activity.ts
    - file: src/store/drafts.ts
    - file: src/store/frontmatter.ts
    - file: src/core/project.ts
verified_at_commit: bb4ed332003f1825a56abcbfd80c7fb9823d1e8e
id: 01M34QY98RMP56FT3WTB1B4Z09
status: active
updated_by: ai-agent
updated_at: 2026-09-22T14:45:15.086Z
---

```
.cortex/
├── cortex.config.yaml   aktörler ve onay politikası (commit'lenir)
├── .secrets.yaml        aktör token'ları (git'e girmez)
├── rules/               şemalar ve genel kurallar, yalnızca insan
├── tree/                _node.md = dal, <ad>.md = yaprak
├── items/               <ulid>-<kısa-ad>/ içinde kalem ve yanıtları
├── activity/            yalnızca eklenen JSONL, aktör başına günde bir dosya
├── drafts/              onay bekleyen AI önerileri
└── .index/              SQLite önbelleği (git'e girmez)
```
- Bir yaprağa alt düğüm eklenince kendiliğinden dala dönüşür (`TreeStore.write`); son alt düğümü silinen dal tekrar tek dosyaya döner (`TreeStore.remove`). Silinen düğüm git geçmişinde kalır.
- Yol parçaları: küçük harf, rakam ve tire (`normalizePath`).
- Kimlikler ULID: aynı anda yazan iki kişi çakışmaz.
- Her aktörün kendi aktivite dosyası var: iki kişi aynı dosyaya yazmaz, birleştirme temiz olur.
- `.cortex/.gitattributes` satır sonlarını LF'ye sabitler, Windows'ta farklar bozulmaz.
