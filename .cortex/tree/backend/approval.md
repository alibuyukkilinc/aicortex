---
title: Taslaklar ve onay politikası
summary: "Her tür için cortex.config.yaml'da politika var: auto (direkt
  yazılır), review (taslak olur) veya human_only (AI yazamaz). AI'ın bilgi
  düğümü yazımları taslak olur; insan tek tek veya toplu onaylar ya da
  reddeder."
tags:
  - onay
  - taslak
links:
  code:
    - file: src/core/cortex.ts
      lines: 420-560
    - file: src/store/drafts.ts
    - file: web/src/pages/Approvals.tsx
verified_at_commit: bb4ed332003f1825a56abcbfd80c7fb9823d1e8e
id: 01M34QY9GN6ZWRZ7CKCPF5SVBN
status: active
updated_by: ai-agent
updated_at: 2026-09-22T14:45:15.032Z
---

- `init` sonrası varsayılan: `node: review`, diğerleri `auto`. Kararlar `auto` çünkü kabul ve ret zaten yalnızca insana ait.
- AI `review` altında düğüm yazınca üst dalın var olduğu hemen kontrol edilir, sonra taslak kaydedilir; o anki düğümün özeti `base_rev` olarak saklanır.
- AI aynı düğüme yeniden taslak önerirse eski taslağının yerine geçer; incelemeci her düğüm için tek taslak görür.
- `approve`: taslaktan sonra düğüm değiştiyse reddeder (409 `conflict`), zorlanırsa yine de uygular.
- Toplu onay/ret (`approveMany`, `rejectMany`): önce üst düğümler onaylanır, böylece yeni bir dal ve altındakiler birlikte onaylanabilir. Biri hata verirse diğerleri devam eder, hatalı olan ayrıca bildirilir.
- Onay ve ret yalnızca insana ait ve denetim kaydı bırakır (`draft.approved` / `draft.rejected`); raporlar AI güven oranını buradan hesaplar.
- Taslaklar `.cortex/drafts/` altında dosyadır; bekleyen onaylar da git'te saklanır.
