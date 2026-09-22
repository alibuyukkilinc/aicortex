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
verified_at_commit: bb4ed332003f1825a56abcbfd80c7fb9823d1e8e
id: 01M34QY9W1VNPQMRXK141RRDFS
status: active
updated_by: ai-agent
updated_at: 2026-09-22T14:45:15.064Z
---

- `init`: .cortex/ klasörünü, token'ları, varsayılan kuralları ve üst dalları oluşturur. Hangi dalların açılacağını terminalde numaralı listeyle sorar (Enter = hepsi); `--branches backend,frontend,odeme` ile sormadan seçilir, şablonda olmayan adlar da kabul edilir (`resolveBranches`). `--lang tr` AI'ların yazım dilini belirler (verilmezse bilgisayarın dili). `--agent-files` var olan CLAUDE.md/AGENTS.md dosyalarına kısa bir Cortex notu ekler.
- `bootstrap`: ağacı doldurması için senin AI'ına verilecek görevi yazdırır (Cortex hiç token harcamaz); yazım dilini de söyler.
- `login`: pano için 10 dakika geçerli, imzalı bir giriş bağlantısı yazdırır.
- node:sqlite uyarı filtresi, node:sqlite yüklenmeden önce çalışmalı; komutların modülleri geç yüklemesinin sebebi bu.
