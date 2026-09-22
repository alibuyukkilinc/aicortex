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
    - file: web/src/hub.tsx
verified_at_commit: da2b11a97658129d06087801ccfc2a5b7acf5b2f
id: 01M34Q1CBDWE3WNXKNMP6QK1W7
status: active
updated_by: ai-agent
updated_at: 2026-09-22T19:28:28.233Z
---

- Sayfalar: Bildirimler, Pano, Bilgi, Aktivite, Onaylar, Raporlar, Kurallar, Kılavuz (+ merkezde Üyeler).
- Adres çubuğunda # ile gezinme (`#/knowledge/...`); iskelet ve menü `web/src/App.tsx` içinde.
- Hangi ekran: `Root` önce `/api/health` ile tek proje mi hub mı öğrenir. Hub'da `/` projelerim, `/admin` organizasyon, `/p/<proje>/` pano, `/invite/<token>` şifre belirleme. `apiPath()` proje isteklerini `/api/p/<proje>/…` ucuna çevirir.
- `useApi` (`web/src/api.ts`) sunucu bir değişiklik bildirdiğinde (`LiveContext`) veriyi yeniden çeker; yeni sayfa yüklenirken önceki veriyi ekranda tutar.
- Yazma isteklerinde `x-cortex-csrf: 1` başlığı gönderilir (çerezle giriş).
- Geliştirme: `npm run dev:web` 5173 portunda açılır, /api ve /login isteklerini 4747'ye yönlendirir.
