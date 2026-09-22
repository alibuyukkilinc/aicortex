---
id: 01M34Q58CAYK4BYD8V50B9QHXC
type: decision
title: Harici SQLite paketi yerine Node'un yerleşik node:sqlite modülü
status: accepted
category_path: backend
author: ai-agent
fields:
  context: Kurulum, yalnızca Node kurulu herhangi bir bilgisayarda (Windows dahil)
    çalışmalı.
  alternatives: "better-sqlite3: daha hızlı ve olgun ama bazı bilgisayarlarda
    derleme hatası veriyor. sqlite-vec: yerel eklenti; yerine bellekte basit bir
    tarama kullanıldı."
  consequences: En düşük Node sürümü 22.13. Açılışta çıkan deneysel uyarıyı
    gizliyoruz. Bazı SQL özellikleri (numaralı parametreler) yok.
created_at: 2026-09-22T14:08:48.010Z
updated_at: 2026-09-22T15:08:29.752Z
updated_by: ai-agent
---

İndeks node:sqlite kullanır (Node 22.13+), böylece `npx` sırasında derleme gerekmez.
