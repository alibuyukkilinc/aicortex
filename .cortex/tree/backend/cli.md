---
title: Komut satırı (CLI)
summary: "`aicortex` (kısa adı `cortex`) komutları: init, start, login, mcp,
  bootstrap, reindex, semantic on|off|status, report. Ağır modüller yalnızca o
  komut çalışınca yüklenir."
tags:
  - cli
links:
  code:
    - file: src/cli.ts
    - file: src/core/init.ts
    - file: src/core/agentFiles.ts
    - file: src/util/runtime-check.ts
verified_at_commit: b9598f3a13fafab490d63c9132c91f06a85def99
id: 01M34QY9W1VNPQMRXK141RRDFS
status: active
updated_by: ai-agent
updated_at: 2026-09-22T15:10:02.460Z
---

- `init`: .cortex/ klasörünü, token'ları, varsayılan kuralları ve üst dalları oluşturur. Hangi dalların açılacağını terminalde numaralı listeyle sorar (Enter = hepsi); `--branches backend,frontend,odeme` ile sormadan seçilir, şablonda olmayan adlar da kabul edilir (`resolveBranches`). `--lang tr` AI'ların yazım dilini belirler (verilmezse bilgisayarın dili). Rapor saat dilimi bilgisayardan alınıp `cortex.config.yaml`'a yazılır. `--agent-files` var olan CLAUDE.md/AGENTS.md dosyalarına kısa bir Cortex notu ekler.
- `bootstrap`: ağacı doldurması için senin AI'ına verilecek görevi yazdırır (Cortex hiç token harcamaz); yazım dilini de söyler.
- `login`: pano için 10 dakika geçerli, imzalı bir giriş bağlantısı yazdırır.
- node:sqlite uyarı filtresi, node:sqlite yüklenmeden önce çalışmalı; komutların modülleri geç yüklemesinin sebebi bu.
- Her komuttan önce Node sürümüne bakılır: 22.16'dan eskiyse "Cortex needs Node.js 22.16 or newer" mesajıyla durur (`src/util/runtime-check.ts`).
