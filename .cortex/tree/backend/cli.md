---
title: Komut satırı (CLI)
summary: "`cortex` / `projcortex` komutları: init, start, login, mcp, bootstrap,
  reindex, semantic on|off|status, report. Ağır modüller yalnızca o komut
  çalışınca yüklenir."
tags:
  - cli
links:
  code:
    - file: src/cli.ts
    - file: src/core/init.ts
    - file: src/core/agentFiles.ts
verified_at_commit: d974755195f2cbd8301ad42d39a41c6250682b77
id: 01M34QY9W1VNPQMRXK141RRDFS
status: active
updated_by: ai-agent
updated_at: 2026-09-22T14:35:00.949Z
---

- `init`: .cortex/ klasörünü, token'ları, varsayılan kuralları ve şablon dalları oluşturur. `--lang tr` AI'ların yazım dilini belirler (verilmezse bilgisayarın dili). `--agent-files` var olan CLAUDE.md/AGENTS.md dosyalarına kısa bir Cortex notu ekler.
- `bootstrap`: ağacı doldurması için senin AI'ına verilecek görevi yazdırır (Cortex hiç token harcamaz); yazım dilini de söyler.
- `login`: pano için 10 dakika geçerli, imzalı bir giriş bağlantısı yazdırır.
- node:sqlite uyarı filtresi, node:sqlite yüklenmeden önce çalışmalı; komutların modülleri geç yüklemesinin sebebi bu.
