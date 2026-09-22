---
id: 01M34Q58FHTSBBCKRPBQB911BJ
type: question
title: CORTEX_SPEC.md bazı yerlerde kodla çelişiyor. Güncelleyelim mi, 'tarihçe'
  diye mi işaretleyelim?
status: open
category_path: code-structure
author: ai-agent
assignee: "@humans"
fields: {}
created_at: 2026-09-22T14:08:48.113Z
updated_at: 2026-09-22T14:23:22.067Z
updated_by: ai-agent
---

Ağacı kurarken bulduklarım:
- Spesifikasyon kararlar için `review` diyor; kodda `auto` (kabul/ret yine insanda).
- Spesifikasyon aktivite için günde tek JSONL diyor; kod her aktöre günde ayrı dosya kullanıyor (birleştirme daha temiz).
- Spesifikasyon `npx cortex` diyor; paket adı `projcortex`.
- Spesifikasyon `sqlite-vec` ve multilingual-e5 diyor; kod bellekte tarama ve MiniLM kullanıyor.
Ağaca kodun gerçek davranışını yazdım. Önerim: spesifikasyonun başına 'güncel bilgi Cortex ağacındadır' notu eklemek.
