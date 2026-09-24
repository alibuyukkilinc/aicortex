---
title: Web pano
summary: "React 19 + Vite. dist/web içine derlenir, `cortexboard start` sunar.
  Sayfalar: Bildirimler, Pano (Trello tarzı kanban), Tartışmalar, Bilgi,
  Aktivite, Onaylar, Eskimiş bilgi, Raporlar, Kurallar, Kılavuz, Arama.
  Türkçe/İngilizce, açık/koyu tema, daraltılabilir menü, canlı güncellenir."
links:
  code:
    - file: web/src/App.tsx
    - file: web/src/api.ts
    - file: web/src/hub.tsx
verified_at_commit: b2ffcf3274cd981a82cd0839e44e5d900cde3a64
id: 01M34Q1CBDWE3WNXKNMP6QK1W7
status: active
updated_by: ai-agent
updated_at: 2026-09-24T20:09:04.843Z
---

- Sayfalar: Bildirimler, Pano, Tartışmalar, Bilgi, Aktivite, Onaylar, Eskimiş bilgi, Raporlar, Kurallar, Kılavuz (+ merkezde Üyeler). Ayrıntı: `frontend/pages`.
- Adres çubuğunda # ile gezinme (`#/knowledge/...`, `#/item/<id>` kalem çekmecesini açar, `#/discussions/<id>` bir tartışmayı açar); iskelet ve menü `web/src/App.tsx` içinde.
- Oturumda iki tür listesi var: `itemTypes` panonun türleri (`discussion` hariç: tartışmaların kendi ekranı var), `allItemTypes` her şey (Kurallar sayfası bunu kullanır).
- Menü üst çubuktaki düğmeyle 56 px'lik ikon şeridine daralır (tarayıcıda hatırlanır); şeridin üstüne gelince ya da sekmeyle girince etiketler sayfanın üstüne kayar, tıklayınca şerit kenara çekilir. Bekleyen sayılar ikonda nokta olur. Tıklama/ayrılma izleyicileri JSX yerine dinleyici olarak bağlı (nav etkileşimli bir öğe değil).
- **Rozet sayıları tek istekten gelir:** kenar çubuğu `GET /api/counts` çağırır (`{ inbox, approvals, stale, discussions }`). Kenar çubuğu her sayfada duruyor ve her canlı olayda yenileniyor; bu yüzden oradan tam liste çekilmez. Kural: menüde yalnızca sayı gösteren bir şey eklenecekse `/counts`'a alan eklenir, yeni bir liste isteği açılmaz.
- Hangi ekran: `Root` önce `/api/health` ile tek proje mi hub mı öğrenir. Hub'da `/` projelerim, `/admin` organizasyon, `/p/<proje>/` pano, `/invite/<token>` şifre belirleme. `apiPath()` proje isteklerini `/api/p/<proje>/…` ucuna çevirir (ek dosya adresleri dahil).
- `useApi` (`web/src/api.ts`) sunucu bir değişiklik bildirdiğinde (`LiveContext`) veriyi yeniden çeker; yeni sayfa yüklenirken önceki veriyi ekranda tutar.
- Yazma isteklerinde `x-cortex-csrf: 1` başlığı gönderilir (çerezle giriş; tek projede çerez bir oturum anahtarıdır, API token'ı değil).
- Ekler `web/src/attachments.tsx`: yükleme ham gövdeyle (`?name=`), yapıştırma/bırakma kancaları, Markdown alanı, ek ızgarası ve önizleme.
- Geliştirme: `npm run dev:web` 5173 portunda açılır, /api ve /login isteklerini 4747'ye yönlendirir.
