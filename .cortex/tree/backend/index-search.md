---
title: İndeks ve kelime araması
summary: "node:sqlite önbelleği; düğümler, kalemler ve aktivite üzerinde FTS5
  kelime araması. Türkçe harfler katlanır (ı→i, ş→s…). Ölçüldü: arama darboğaz
  değil, her değişiklikte çalışan tam reindex darboğaz."
links:
  code:
    - file: src/index/db.ts
    - file: src/core/cortex.ts
    - file: src/store/activity.ts
verified_at_commit: 15514a6c6d4cb624bf19236dc7e8ff18174e1c9c
id: 01M34QY9AVGX8V5NP7DDB49TM1
status: active
updated_by: ai-agent
updated_at: 2026-09-22T23:32:50.570Z
---

- `src/index/db.ts`: `node:sqlite`, WAL, `INDEX_VERSION` değişince tablolar düşürülüp dosyalardan yeniden kurulur. Gömme vektörleri (`embeddings`) bilerek bu silmenin dışında: yeniden hesaplamak pahalı.
- FTS5 sanal tablosu `docs_fts`, `tokenize = 'unicode61 remove_diacritics 2'`. Türkçe harfler katlandığı için "kullanici" araması "Kullanıcı"yı bulur. Sıralama bm25, başlık ve özet daha ağır.
- Kalem/düğüm/aktivite sorguları düz tablolardan; `queryItems` `blocking DESC, updated_at DESC` sıralar.

## Ölçülen davranış (2026-09-23, sentetik projeler)
Bu sayılar "daha hızlı arama için gerçek DB'ye geçelim mi?" sorusunu yanıtlamak için ölçüldü. Yanıt: **arama zaten sorun değil.**

| Düğüm | Kelime araması p50 | p95 | Tam reindex | Tek düğüm yazma | İndeks boyutu |
|---|---|---|---|---|---|
| 100 | 12.9 ms | 15.8 ms | 0.34 sn | 5.7 ms | 0.8 MB |
| 1.000 | 14.7 ms | 22.4 ms | 2.7 sn | 15.2 ms | 6.8 MB |
| 5.000 | 22.7 ms | 42.7 ms | 8.9 sn | 26.4 ms | 30.5 MB |

50 kat veri, 1.8 kat arama gecikmesi: FTS5 gerçek bir ters indeks, doğrusal değil. Başka bir veritabanı burayı ölçülebilir şekilde iyileştirmez.

## Asıl darboğaz: reindex() ve aktivite günlüğü
`reindex()` her şeyi sıfırdan kurar ve `.cortex` altındaki **herhangi bir dosya değişiminde** (elle düzenleme, `git pull`, başka bir Cortex süreci) 300 ms gecikmeyle tetiklenir (`src/core/cortex.ts` watch). Maliyeti toplam geçmişle doğrusal büyür ve büyümeyi asıl sürükleyen aktivite günlüğü: `activityStore.all()` her seferinde tüm JSONL satırlarını yeniden ayrıştırır.

Ağaç 50 düğümde sabit tutulup yalnızca aktivite büyütüldüğünde:

| Aktivite kaydı | Tam reindex |
|---|---|
| 500 | 108 ms |
| 5.000 | 423 ms |
| 20.000 | 1.626 ms |

Ölçek için: bu proje ilk iki günde 312 aktivite kaydı üretti. Yani duvar "çok fazla bilgi" değil, "çok fazla geçmiş" — ve çözümü veritabanını değiştirmek değil, reindex'i artımlı yapmak (ya da yalnızca aktivite günlüğünü DB'ye taşımak; append-only, incelenmiyor, birleştirilmiyor).

## Bilinen, ölçülmüş küçük pürüzler
- `deleteDoc` FTS'te `kind`/`ref` üzerinden siliyor ama bu sütunlar `UNINDEXED`. Teoride her yazımda tam tarama; ölçümde büyüme ılımlı çıktı (200 belgede 7.5 ms → 6.000 belgede 11.8 ms), yani şu an acil değil ama artımlı reindex işine girilirse birlikte ele alınmalı.
- `activity` tablosunda `ref` filtresi `json_each` ile tam tarama yapıyor; aktivite büyüdükçe ilk acıyacak sorgu burası.
