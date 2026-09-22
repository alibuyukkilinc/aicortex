---
title: Aktivite günlüğü
summary: "Kim ne yaptı ve neden: eylem, özet, neden (kod değişikliği, düzeltme,
  yeniden düzenleme, ayar ve yayında zorunlu), dosyalar, commit, ilgili
  kayıtlar. Cortex'in kendi denetim kayıtları da burada, yapılandırılmış
  veriyle."
tags:
  - aktivite
  - denetim
links:
  code:
    - file: src/core/activity.ts
    - file: src/store/activity.ts
verified_at_commit: d974755195f2cbd8301ad42d39a41c6250682b77
id: 01M34QY9JNH4GZNC68N7H8SJ0M
status: active
updated_by: ai-agent
updated_at: 2026-09-22T14:35:00.926Z
---

- `ActivityService.log` kaydı `rules/activity.schema.yaml`'a göre denetler; `refs` gerçek bir kalem kimliği ya da düğüm yolu olmalı.
- Cevap, değiştirilen dosyaları anlatan bilgi düğümlerini listeler: "bunları güncelle ya da doğrula".
- Sistem kayıtları (`node.updated`, `draft.*`, `item.*`, `rules.updated`) `meta` taşır: tür, eski/yeni durum, taslak türü, öneren. Raporlar metni ayrıştırmak zorunda kalmaz; eski kayıtlar için metin ayrıştırma yedek olarak duruyor.
