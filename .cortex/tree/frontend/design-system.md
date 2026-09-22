---
title: "Tasarım sistemi: renkler, yazı tipi, bileşenler"
summary: "Apple'ın sistem görünümüne yakın: sistem mavisi tek vurgu, nötr
  griler, gerçek siyah koyu tema, yarı saydam üst çubuk ve kenar çubuğu,
  çerçevesiz kartlar. Apple cihazlarda SF Pro, diğerlerinde pakete gömülü Inter.
  Gradyan ve neon yok."
tags:
  - tasarim
  - grafik
  - erisilebilirlik
links:
  code:
    - file: web/src/styles.css
    - file: web/src/charts.tsx
    - file: web/src/ui.tsx
    - file: web/src/main.tsx
verified_at_commit: da2b11a97658129d06087801ccfc2a5b7acf5b2f
id: 01M34QYA1Q9QSJH06S50NZT2N4
status: active
updated_by: ai-agent
updated_at: 2026-09-22T19:28:28.254Z
---

## Yazı tipi
- Sıra: `-apple-system` / SF Pro, sonra Inter Variable. Başlıklar `--font-display`, 28 px, sıkı harf aralığı.
- Inter Variable (arayüz) ve JetBrains Mono Variable (kod), `@fontsource-variable/*` paketlerinden `web/src/main.tsx` içinde yüklenir. Dış font servisi yok: pano yerel bir araç, internetsiz de çalışmalı.
- Tarayıcı yalnızca gereken alt kümeleri indirir (Latin + Latin Extended, Türkçe harfler dahil, ~130 KB).

## Değişkenler (`web/src/styles.css`)
- Temalar: `:root` (açık), `@media (prefers-color-scheme: dark)` ve `:root[data-theme="dark"]`; üçü de aynı değişkenleri tanımlamalı.
- Yüzeyler: `--bg`, `--surface`, `--surface-2`, `--surface-3`; çizgiler `--border`, `--border-strong`; metin `--text`, `--muted`, `--faint`.
- Vurgu: sistem mavisi (`--accent` #0071e3 / koyuda #0a84ff), `--accent-hover`, `--accent-soft`, `--accent-text`, `--on-accent`, odak halkası `--ring`.
- Dolgular: `--fill`, `--fill-strong` (Apple'ın sistem dolguları gibi yarı saydam gri), `--raised` (dolgu üstündeki kart), `--chrome` (bulanık arka planlı üst çubuk ve kenar çubuğu).
- Ölçek: `--radius-sm/--radius/--radius-lg/--radius-xl` (6/8/12/14), `--control` 32 px, `--control-sm` 28 px, gölgeler `--shadow-sm/--shadow/--shadow-lg` (koyu temada kartlarda gölge yok).
- Seçim kutusu oku (`--chevron`) ve kaydırma çubukları temaya uyar.

## Bileşenler
- Düğme: `.btn` (varsayılan), `.primary`, `.danger`, `.ghost`, `.sm`; hepsi aynı yükseklikte. Klavye odağı `:focus-visible` ile görünür.
- Açılır pencere (`Modal`): başlık + kapatma düğmesi, kayan gövde, yapışkan alt bölüm (`.modal-foot`). Çekmece (`Drawer`) ve bildirim (`toast`, ikonlu) aynı dilde.
- Etiketler: `StatusChip` hafif renkli köşeli rozet; `TypeChip` rozet değil, küçük büyük harfli sessiz etiket. Logo tek renk (gradyan yok). Emoji kullanılmaz, çizgi ikonlar `web/src/ui.tsx` içindeki `Icon`.
- Hareketler 120-200 ms; `prefers-reduced-motion` açıksa kapanır.

## Grafikler
- Renkler: `--viz-ai` (mor), `--viz-human` (camgöbeği), `--viz-bar`, `--viz-grid`, `--viz-axis`; iki temada renk körlüğü testinden geçti, yüzey renkleri buna göre korunuyor.
- Çubuk en fazla 24 px, veri ucunda 4 px yuvarlatma, bölümler arası 2 px, ince ızgara, fare ve klavyeyle ipucu, tablo görünümü (`web/src/charts.tsx`).
