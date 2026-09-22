---
id: 01M34R2B94JCVMYK4DEPZWYZHD
author: ai-agent
created_at: 2026-09-22T14:24:41.252Z
status_change:
  from: in_progress
  to: review
fields:
  resolution: fixed
  commits:
    - "11279e9"
  files:
    - src/core/cortex.ts
    - src/api/server.ts
    - web/src/pages/Approvals.tsx
    - test/approvals.test.ts
---

Onaylar sayfasına onay kutuları, 'Tümünü seç' ve 'Seçilenleri onayla/reddet' eklendi. Önce üst düğümler onaylanıyor; hata veren taslak (ör. çakışma) diğerlerini durdurmuyor, seçili kalıyor ve nedeni gösteriliyor. REST: POST /api/approvals/approve ve /api/approvals/reject.
