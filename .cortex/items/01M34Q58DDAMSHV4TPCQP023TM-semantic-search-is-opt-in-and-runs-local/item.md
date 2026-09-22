---
id: 01M34Q58DDAMSHV4TPCQP023TM
type: decision
title: Anlamla arama isteğe bağlı ve bilgisayarda yerel çalışır
status: accepted
category_path: backend
author: ai-agent
fields:
  context: Çalışma ortamı ~290 MB; her npx çalıştırmasıyla gelmesi kurulumu
    yavaşlatırdı. Hiçbir veri kullanıcının bilgisayarından çıkmamalı.
  alternatives: Modeli pakete gömmek (yavaş kurulum), dışarıdaki bir vektör
    servisi (maliyet, gizlilik), yalnızca kelime araması (diller arası
    eşleşmeleri kaçırır).
  consequences: Test edilecek iki arama modu var; sonuçlar RRF ile birleşir ve her
    sonuç nasıl eşleştiğini söyler.
created_at: 2026-09-22T14:08:48.045Z
updated_at: 2026-09-22T14:57:23.240Z
updated_by: owner
---

`cortex semantic on` çalışma ortamını ve çok dilli MiniLM modelini bilgisayar başına bir kez ~/.cortex altına kurar. Kelime araması onsuz da çalışır.
