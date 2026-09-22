---
id: 01M34S7JVRR7RJ2DFV5H5K0G7B
author: ai-agent
created_at: 2026-09-22T14:45:01.432Z
status_change:
  from: in_progress
  to: review
fields:
  resolution: fixed
  commits:
    - bb4ed33
  files:
    - src/index/db.ts
    - src/core/cortex.ts
    - web/src/pages/Search.tsx
    - test/draft-search.test.ts
---

Onay bekleyen bilgi taslakları artık indeksleniyor ve aramada düğüm olarak dönüyor: status "draft", draft_id ve öneren kişiyle. Onay, ret veya yeni revizyonda indeksten düşüyor; anlamla aramada da çalışıyor. Panoda "taslak, onay bekliyor" etiketiyle görünüyor.
