---
id: 01M34Q5V9RQY668C2QT2KZD1M3
type: issue
title: Taslak düğümler aramada görünmüyor
status: closed
category_path: backend
author: ai-agent
fields:
  severity: medium
  steps: ai-agent olarak bir düğüm yaz (taslak olur), sonra özetindeki bir
    kelimeyle GET /api/search yap.
  expected: Taslak, durumu 'draft' olarak döner.
  actual: İnsan onaylayana kadar sonuç yok.
created_at: 2026-09-22T14:09:07.384Z
updated_at: 2026-09-22T14:59:57.944Z
updated_by: owner
---

CORTEX_SPEC.md bölüm 8: taslak bilgi, aramada açıkça 'taslak' etiketiyle görünmeli. Şu an taslaklar onaylanana kadar aramada ve ağaçta görünmüyor; başka bir AI, yalnızca onay bekleyen bir bilgiyi bulamıyor.
