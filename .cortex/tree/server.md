---
title: Çalıştırma, derleme ve yayın
summary: "Yalnızca yerelde çalışır: `cortex start` 127.0.0.1:4747'de açılır.
  Derleme = tsc (sunucu) + vite (pano), çıktı dist/. npm paketi olarak
  yayınlanacak (isim geçici: projcortex). CI henüz yok."
tags:
  - derleme
  - yayin
links:
  code:
    - file: package.json
    - file: tsconfig.json
    - file: vite.config.ts
verified_at_commit: d974755195f2cbd8301ad42d39a41c6250682b77
id: 01M34Q1CBEMJA6S58G199HVFBQ
status: active
updated_by: ai-agent
updated_at: 2026-09-22T14:35:00.880Z
---

- Node 22.13 veya üstü gerekir (node:sqlite için). Veritabanı sunucusu, Docker veya API anahtarı gerekmez.
- `npm run build`, `npm test` (node:test, tsx ile), `npm run typecheck` (sunucu ve web).
- `npm run dev -- start` API'yi kaynaktan çalıştırır, panonun son build'ini sunar.
- Ekip sunucusu, çoklu proje ve CI henüz yapılmadı (açık görevlere bak).
