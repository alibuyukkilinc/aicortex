---
title: Çalıştırma, derleme ve yayın
summary: "Yalnızca yerelde çalışır: `aicortex start` 127.0.0.1:4747'de açılır.
  Derleme = tsc (sunucu) + vite (pano), çıktı dist/. npm paketi: aicortex (henüz
  yayınlanmadı). CI henüz yok."
tags:
  - derleme
  - yayin
links:
  code:
    - file: package.json
    - file: tsconfig.json
    - file: vite.config.ts
verified_at_commit: 4286d44b16a1e5a8ee46681a64ba1e3d593809d0
id: 01M34Q1CBEMJA6S58G199HVFBQ
status: active
updated_by: ai-agent
updated_at: 2026-09-22T14:53:23.074Z
---

- Node 22.13 veya üstü gerekir (node:sqlite için). Veritabanı sunucusu, Docker veya API anahtarı gerekmez.
- `npm run build`, `npm test` (node:test, tsx ile), `npm run typecheck` (sunucu ve web).
- `npm run dev -- start` API'yi kaynaktan çalıştırır, panonun son build'ini sunar.
- Paket adı `aicortex`; komut `aicortex` ve kısa adıyla `cortex` olarak gelir.
- Ekip sunucusu, çoklu proje ve CI henüz yapılmadı (açık görevlere bak).
