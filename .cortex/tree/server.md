---
title: Çalıştırma, derleme ve yayın
summary: "Yalnızca yerelde çalışır: `aicortex start` 127.0.0.1:4747'de açılır.
  Derleme = tsc + vite, çıktı dist/. CI: Windows, macOS, Linux × Node 22.16 ve
  24; kurulum testi 2 dakika sınırını ölçer. npm paketi aicortex, henüz
  yayınlanmadı."
tags:
  - derleme
  - yayin
links:
  code:
    - file: package.json
    - file: tsconfig.json
    - file: vite.config.ts
    - file: .github/workflows/ci.yml
    - file: scripts/smoke.mjs
verified_at_commit: d91d320723a54e1bc12bc4b69074b8fd11dd20d4
id: 01M34Q1CBEMJA6S58G199HVFBQ
status: active
updated_by: ai-agent
updated_at: 2026-09-22T16:00:57.544Z
---

- Node 22.16 veya üstü gerekir (node:sqlite'ın FTS5'li ilk sürümü). Veritabanı sunucusu, Docker veya API anahtarı gerekmez.
- `npm run build`, `npm test` (node:test, tsx ile), `npm run typecheck` (sunucu ve web).
- `npm run dev -- start` API'yi kaynaktan çalıştırır, panonun son build'ini sunar.
- Paket adı `aicortex`; komut `aicortex` ve kısa adıyla `cortex` olarak gelir.
- CI (`.github/workflows/ci.yml`): her push ve PR'da tip kontrolü, testler, derleme ve `npm run smoke`. Uzak depo henüz yok; GitHub'a gönderilince çalışır.
- `npm run smoke` (`scripts/smoke.mjs`): paketi `npm pack` ile paketler, boş klasöre kurar, `aicortex init` ve `start` çalıştırır, API/brief/pano cevabını kontrol eder ve süreyi ölçer (sınır 120 s, yerelde ~15-20 s).
- Ekip sunucusu ve çoklu proje henüz yapılmadı.
