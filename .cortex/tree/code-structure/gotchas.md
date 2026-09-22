---
title: Bilinen tuzaklar
summary: "node:sqlite: FTS5 ancak Node 22.16'dan itibaren var; numaralı
  parametre (?1) yok, adlandırılmış kullan; uyarı filtresinden önce
  yüklenmemeli. SQL LIKE'ta _ joker. Windows'ta git çağrısı ~20 ms. Satır
  sonları LF."
tags:
  - tuzak
  - sqlite
  - windows
links:
  code:
    - file: src/index/db.ts
    - file: src/git/git.ts
    - file: src/cli.ts
verified_at_commit: da2b11a97658129d06087801ccfc2a5b7acf5b2f
id: 01M34QYABJE3KGV82NE6BGAWEK
status: active
updated_by: ai-agent
updated_at: 2026-09-22T19:28:28.247Z
---

- **En düşük Node 22.16**: 22.13, 22.14 ve 22.15'teki node:sqlite FTS5 içermiyor, Cortex hiç açılmıyordu. Yerelde 22.16 kullanıldığı için CI'daki en eski sürüm testine kadar fark edilmedi.
- **node:sqlite parametreleri**: `?1` gibi numaralı yer tutucular çalışmıyor; `:ad` ya da düz `?` kullan.
- **LIKE ve alt çizgi**: dosya adlarındaki `_` joker gibi eşleşiyordu; kod bağlantısı aramaları birebir karşılaştırıyor.
- **ExperimentalWarning**: `src/cli.ts` SQLite uyarısını gizler; ondan önce hiçbir şey node:sqlite yüklememeli.
- **Taşıma tespiti**: `git diff` bağlı yolla sınırlanınca taşınan dosyanın yeni yeri görünmüyor; silinmiş görünen dosyalar için ayrıca kontrol ediliyor.
- **HEAD kontrolü**: 5 saniyede bir (`Cortex.watch`); Windows'ta her git çağrısı yaklaşık 20 ms.
- **Statik dosyalar ve yeniden derleme**: `@fastify/static` `wildcard: false` ile dosya listesini yalnızca açılışta çıkarıyordu; sunucu açıkken derlenen pano boş sayfa gösteriyordu (yeni JS dosyası yerine HTML dönüyordu). Önceki teşhis "tarayıcı önbelleği" yanlıştı. Artık `wildcard: true` ve eksik dosyada 404.
- **Brief boyutu**: 800 token sınırı testle korunuyor; listeler "sayı + ilk 5" şeklinde tutulur.
