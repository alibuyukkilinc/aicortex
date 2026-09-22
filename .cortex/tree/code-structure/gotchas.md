---
title: Bilinen tuzaklar
summary: node:sqlite numaralı parametre (?1) desteklemiyor, adlandırılmış
  kullan; uyarı filtresinden önce yüklenmemeli. SQL LIKE'ta _ joker sayılıyor,
  birebir karşılaştır. Windows'ta git çağrısı ~20 ms. Satır sonları LF kalmalı.
tags:
  - tuzak
  - sqlite
  - windows
links:
  code:
    - file: src/index/db.ts
    - file: src/git/git.ts
    - file: src/cli.ts
verified_at_commit: 4286d44b16a1e5a8ee46681a64ba1e3d593809d0
id: 01M34QYABJE3KGV82NE6BGAWEK
status: active
updated_by: ai-agent
updated_at: 2026-09-22T14:53:23.100Z
---

- **node:sqlite parametreleri**: `?1` gibi numaralı yer tutucular çalışmıyor; `:ad` ya da düz `?` kullan.
- **LIKE ve alt çizgi**: dosya adlarındaki `_` joker gibi eşleşiyordu; kod bağlantısı aramaları birebir karşılaştırıyor.
- **ExperimentalWarning**: `src/cli.ts` SQLite uyarısını gizler; ondan önce hiçbir şey node:sqlite yüklememeli.
- **Taşıma tespiti**: `git diff` bağlı yolla sınırlanınca taşınan dosyanın yeni yeri görünmüyor; silinmiş görünen dosyalar için ayrıca kontrol ediliyor.
- **HEAD kontrolü**: 5 saniyede bir (`Cortex.watch`); Windows'ta her git çağrısı yaklaşık 20 ms.
- **Sunucu açıkken pano yeniden derlenirse** tarayıcı eski index.html'i tutabilir; sayfayı yenile.
- **Brief boyutu**: 800 token sınırı testle korunuyor; listeler "sayı + ilk 5" şeklinde tutulur.
