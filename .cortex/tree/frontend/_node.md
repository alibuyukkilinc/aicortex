---
title: Web pano
summary: "React 19 + Vite. dist/web içine derlenir, `cortex start` sunar.
  Sayfalar: Bildirimler, Pano (Trello tarzı kanban), Bilgi, Aktivite, Onaylar,
  Eskimiş bilgi, Raporlar, Kurallar, Kılavuz, Arama. Türkçe/İngilizce, açık/koyu
  tema, daraltılabilir menü, canlı güncellenir."
links:
  code:
    - file: web/src/App.tsx
    - file: web/src/api.ts
    - file: web/src/hub.tsx
verified_at_commit: fa153b59fc0e9e369e1ce074c760a26676778a6b
id: 01M34Q1CBDWE3WNXKNMP6QK1W7
status: active
updated_by: ai-agent
updated_at: 2026-09-24T03:22:51.867Z
---

- Sayfalar: Bildirimler, Pano, Bilgi, Aktivite, Onaylar, Eskimiş bilgi, Raporlar, Kurallar, Kılavuz (+ merkezde Üyeler). Ayrıntı: `frontend/pages`.
- Adres çubuğunda # ile gezinme (`#/knowledge/...`, `#/item/<id>` kalem çekmecesini açar); iskelet ve menü `web/src/App.tsx` içinde.
- Menü üst çubuktaki düğmeyle 56 px'lik ikon şeridine daralır (tarayıcıda hatırlanır); şeridin üstüne gelince ya da sekmeyle girince etiketler sayfanın üstüne kayar, tıklayınca şerit kenara çekilir. Bekleyen sayılar ikonda nokta olur. Tıklama/ayrılma izleyicileri JSX yerine dinleyici olarak bağlı (nav etkileşimli bir öğe değil).
- Hangi ekran: `Root` önce `/api/health` ile tek proje mi hub mı öğrenir. Hub'da `/` projelerim, `/admin` organizasyon, `/p/<proje>/` pano, `/invite/<token>` şifre belirleme. `apiPath()` proje isteklerini `/api/p/<proje>/…` ucuna çevirir (ek dosya adresleri dahil).
- `useApi` (`web/src/api.ts`) sunucu bir değişiklik bildirdiğinde (`LiveContext`) veriyi yeniden çeker; yeni sayfa yüklenirken önceki veriyi ekranda tutar.
- Yazma isteklerinde `x-cortex-csrf: 1` başlığı gönderilir (çerezle giriş; tek projede çerez bir oturum anahtarıdır, API token'ı değil).
- Ekler `web/src/attachments.tsx`: yükleme ham gövdeyle (`?name=`), yapıştırma/bırakma kancaları, Markdown alanı, ek ızgarası ve önizleme.
- Geliştirme: `npm run dev:web` 5173 portunda açılır, /api ve /login isteklerini 4747'ye yönlendirir.
