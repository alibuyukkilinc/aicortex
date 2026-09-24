---
title: "Tasarım sistemi: renkler, yazı tipi, bileşenler"
summary: "Apple'ın sistem görünümüne yakın: sistem mavisi tek vurgu, nötr
  griler, gerçek siyah koyu tema, yarı saydam üst çubuk ve kenar çubuğu,
  çerçevesiz kartlar. Pano kartları Trello tarzı (kapak, renkli etiket,
  rozetler). Apple cihazlarda SF Pro, diğerlerinde Inter. Gradyan ve neon yok."
links:
  code:
    - file: web/src/styles.css
    - file: web/src/charts.tsx
    - file: web/src/ui.tsx
    - file: web/src/main.tsx
verified_at_commit: fa153b59fc0e9e369e1ce074c760a26676778a6b
id: 01M34QYA1Q9QSJH06S50NZT2N4
status: active
updated_by: ai-agent
updated_at: 2026-09-24T03:22:53.551Z
---

## Yazı tipi
- Sıra: `-apple-system` / SF Pro, sonra Inter Variable. Başlıklar `--font-display`, 28 px, sıkı harf aralığı.
- Inter Variable (arayüz) ve JetBrains Mono Variable (kod), `@fontsource-variable/*` paketlerinden `web/src/main.tsx` içinde yüklenir. Dış font servisi yok: pano yerel bir araç, internetsiz de çalışmalı.

## Değişkenler (`web/src/styles.css`)
- Temalar: `:root` (açık), `@media (prefers-color-scheme: dark)` ve `:root[data-theme="dark"]`; üçü de aynı değişkenleri tanımlamalı.
- Yüzeyler: `--bg`, `--surface`, `--surface-2`, `--surface-3`; çizgiler `--border`, `--border-strong`; metin `--text`, `--muted`, `--faint`.
- Vurgu: sistem mavisi (`--accent` #0071e3 / koyuda #0a84ff), `--accent-hover`, `--accent-soft`, `--accent-text`, `--on-accent`, odak halkası `--ring`. Durum: `--ok`, `--warn`, `--danger` (+ `-soft`).
- Dolgular: `--fill`, `--fill-strong`, `--raised` (dolgu üstündeki kart), `--chrome`.
- Ölçek: `--radius-sm/--radius/--radius-lg/--radius-xl` (6/8/12/14), `--control` 32 px, `--control-sm` 28 px, gölgeler `--shadow-sm/--shadow/--shadow-lg`.

## Bileşenler
- Düğme: `.btn` (varsayılan), `.primary`, `.danger`, `.ghost`, `.sm`; `.icon-btn` (ikon-only, her zaman `aria-label`).
- `Pressable` / `ListRow` (`web/src/ui.tsx`): tıklanan ama düğme olamayan satır ve kartlar için `role="button"`, sekme sırası, Enter/Space. Odak halkası `:focus-visible`; kırpan kartların içindeki satırlarda halka içe çizilir.
- Açılır pencere (`Modal`), çekmece (`Drawer`), bildirim (`toast`). Escape yalnızca en üstteki pencereyi kapatır. Arka plan örtüleri `aria-hidden`.
- Etiketler: `StatusChip`, `TypeChip`, derece çipi (`.sev-high/medium/low`). Emoji yok, çizgi ikonlar `Icon` (ek için `clip`, `image`, `download`, `trash`, `text`, `clock`).
- Pano kartı (`.kcard`): kenardan kenara kapak resmi (`.kcard-cover`), renkli seviye etiketi (`.klabel.lv-low/medium/high/critical`: yeşil/sarı/turuncu/kırmızı), rozetler (`.kbadge`; son tarih geçtiyse kırmızı, bugünse turuncu, bitince yeşil), sütun altında "Kart ekle".
- Ekler: `.att-grid` küçük resim ızgarası, üzerine gelince işlemler (dokunmatikte hep görünür); `.drop-area.dropping` kesikli vurgu çerçevesi ve "bırak" ipucu; Markdown alanında Yaz/Önizle sekmeleri (`.md-tabs`).
- `.sr-only`: yalnızca ekran okuyucu için metin (panodaki `aria-live` duyurusu).
- Hareketler 120-200 ms; `prefers-reduced-motion` açıksa kapanır.

## Grafikler
- Renkler: `--viz-ai` (mor), `--viz-human` (camgöbeği), `--viz-system` (denetim kayıtları, soluk), `--viz-bar`, `--viz-grid`, `--viz-axis`.
- Çubuk en fazla 24 px, veri ucunda 4 px yuvarlatma, bölümler arası 2 px, ince ızgara, fare ve klavyeyle ipucu, tablo görünümü (`web/src/charts.tsx`). `Series.context`: yalnızca ipucu ve açıklamada görünen, ekseni belirlemeyen seri.
