---
title: Renk kuralları ve grafikler
summary: "Tüm renkler styles.css'te değişken (token) olarak tanımlı: açık tema,
  sistem koyu teması ve elle seçilen koyu tema. Grafikler elle yazılmış SVG
  (charts.tsx); AI/insan renkleri iki temada da renk körlüğü testinden geçti."
tags:
  - tasarim
  - grafik
  - erisilebilirlik
links:
  code:
    - file: web/src/styles.css
    - file: web/src/charts.tsx
    - file: web/src/ui.tsx
verified_at_commit: bb4ed332003f1825a56abcbfd80c7fb9823d1e8e
id: 01M34QYA1Q9QSJH06S50NZT2N4
status: active
updated_by: ai-agent
updated_at: 2026-09-22T14:45:15.051Z
---

- Temalar: `:root`, `@media (prefers-color-scheme: dark)` ve `:root[data-theme="dark"]`; üçü de aynı değişkenleri tanımlamalı.
- Grafik renkleri: `--viz-ai` (mor), `--viz-human` (camgöbeği), `--viz-bar`, `--viz-grid`, `--viz-axis`.
- Grafik kuralları: çubuk en fazla 24px, veri ucunda 4px yuvarlatma, üst üste bölümler arasında 2px boşluk, ince ızgara, fareyle ve klavyeyle açılan ipucu, tablo görünümü.
- Ortak parçalar (ikon, etiketler, bildirimler, oturum bilgisi) `web/src/ui.tsx` içinde.
