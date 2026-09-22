---
title: Web pano
summary: "React 19 + Vite. dist/web içine derlenir, `cortex start` sunar.
  Sayfalar: Gelen kutusu, Pano (kanban), Bilgi, Aktivite, Onaylar, Raporlar,
  Kurallar, Arama. Türkçe/İngilizce, açık/koyu tema, canlı güncellenir."
tags:
  - web
  - react
links:
  code:
    - file: web/src/App.tsx
    - file: web/src/api.ts
verified_at_commit: d974755195f2cbd8301ad42d39a41c6250682b77
id: 01M34Q1CBDWE3WNXKNMP6QK1W7
status: active
updated_by: ai-agent
updated_at: 2026-09-22T14:35:00.875Z
---

- Adres çubuğunda # ile gezinme (`#/knowledge/...`); iskelet ve menü `web/src/App.tsx` içinde.
- `useApi` (`web/src/api.ts`) sunucu bir değişiklik bildirdiğinde (`LiveContext`) veriyi yeniden çeker; yeni sayfa yüklenirken önceki veriyi ekranda tutar.
- Yazma isteklerinde `x-cortex-csrf: 1` başlığı gönderilir (çerezle giriş).
- Geliştirme: `npm run dev:web` 5173 portunda açılır, /api ve /login isteklerini 4747'ye yönlendirir.
