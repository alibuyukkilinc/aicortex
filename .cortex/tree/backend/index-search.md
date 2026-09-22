---
title: İndeks ve kelime araması
summary: node:sqlite önbelleği; düğümler, kalemler ve aktivite üzerinde FTS5
  kelime araması. Türkçe harfler katlanır (ı→i, ş→s…), 'kullanici' araması
  'Kullanıcı'yı bulur. INDEX_VERSION değişince indeks silinip yeniden kurulur.
tags:
  - arama
  - sqlite
links:
  code:
    - file: src/index/db.ts
    - file: src/util/text.ts
verified_at_commit: d974755195f2cbd8301ad42d39a41c6250682b77
id: 01M34QY9AVGX8V5NP7DDB49TM1
status: active
updated_by: ai-agent
updated_at: 2026-09-22T14:35:00.907Z
---

- `Index` (`src/index/db.ts`) düğümleri, kalemleri, aktiviteyi, kod bağlantılarını ve vektörleri tutar.
- `fold()` (`src/util/text.ts`) küçük harfe çevirir ve aksanları kaldırır. FTS5'in atlamadığı ı/İ'yi de düzeltir.
- Arama önce tüm kelimelerle dener, sonuç yoksa kelimelerden herhangi biriyle dener; bu sırada "ve, ile, the" gibi dolgu kelimeleri atlar.
- Tablo yapısı değişirse `INDEX_VERSION` artırılır; eski önbellek kendiliğinden silinir.
- `cortex reindex` her şeyi dosyalardan yeniden kurar. Hiçbir veri yalnızca indekste durmaz.
- Cevaplar `budget` alır (yaklaşık 4 karakter = 1 token, `estimateTokens`) ve sığacak kadar kesilir.
