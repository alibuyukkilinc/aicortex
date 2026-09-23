---
id: 01M34WPJ1Y78P0GC8CMJR383PY
type: issue
title: "'Açık kayıtlar' sorgusu kabul edilmiş kararları da açık iş gibi döndürüyor"
status: closed
category_path: backend/items-and-rules
author: ai-agent
fields:
  severity: medium
  steps: Birkaç kararı kabul et, sonra GET /api/items?open=true
  expected: Yalnızca üzerinde çalışılacak kayıtlar (görev, issue, soru).
  actual: Kabul edilmiş kararlar da listede.
created_at: 2026-09-22T15:45:37.854Z
updated_at: 2026-09-23T18:59:37.393Z
updated_by: ai-agent
---

Kabul edilmiş karar (accepted) bitiş durumu sayılmıyor, çünkü ileride yerine başka karar gelebilir (superseded). Bu yüzden `GET /api/items?open=true` ve `cortex_items(open: true)` 8 kabul edilmiş kararı da 'açık' diye döndürüyor.

Etkisi: 'açık görevlerimiz neler' sorusunda cevabın ~650 tokenının ~420'si işe yaramayan kararlara gitti. AI ya fazladan token harcıyor ya da her tür için ayrı sorgu atmak zorunda kalıyor.

Öneri: şemaya 'iş sayılmayan durumlar' kavramı (ör. decision.accepted, note.active) veya ayrı bir `work=true` filtresi. Kararlar yine `type=decision` ile ya da aramada bulunur.
