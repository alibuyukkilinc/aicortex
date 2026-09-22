---
title: MCP sunucusu
summary: "`cortex mcp --actor <id>` stdio üzerinden çalışır. Araçlar: brief,
  tree, node, search, items, kalem oluştur/güncelle, yanıt, ask, inbox, aktivite
  yaz/oku, code_context, verify_node, update_node, rules, report. Sıkıştırılmış
  JSON döner."
tags:
  - mcp
links:
  code:
    - file: src/mcp/server.ts
verified_at_commit: d974755195f2cbd8301ad42d39a41c6250682b77
id: 01M34QY9T47QSX4Q0GQ8V6GPEH
status: active
updated_by: ai-agent
updated_at: 2026-09-22T14:35:00.943Z
---

- Çekirdeğin üstünde ince bir katman (`buildMcpServer`). Çıktı sıkıştırılmış JSON, çünkü her bayt AI için token demek.
- Hatalar `isError` ile, REST'teki aynı kod/mesaj/ipucuyla döner.
- MCP yolunda asla `console.log` kullanılmaz: stdout protokole aittir (stderr kullan).
- `test/interfaces.test.ts` araç listesini birebir kontrol eder; yeni araç eklerken orayı da güncelle.
