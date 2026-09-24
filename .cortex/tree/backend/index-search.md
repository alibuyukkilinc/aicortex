---
title: İndeks ve kelime araması
summary: "node:sqlite önbelleği; düğümler, kalemler ve aktivite üzerinde FTS5
  kelime araması. Türkçe harfler katlanır. İndeks artımlı güncellenir (yalnızca
  değişen kayıt). Kalem satırı panonun kartını da taşır: açık iş, ek sayısı,
  kapak, öncelik, son tarih."
links:
  code:
    - file: src/index/db.ts
    - file: src/core/sync.ts
    - file: src/core/cortex.ts
    - file: src/store/activity.ts
verified_at_commit: fa153b59fc0e9e369e1ce074c760a26676778a6b
id: 01M34QY9AVGX8V5NP7DDB49TM1
status: active
updated_by: ai-agent
updated_at: 2026-09-24T03:22:53.120Z
---

- `src/index/db.ts`: `node:sqlite`, WAL, `INDEX_VERSION` (şu an 7) değişince tablolar düşürülüp dosyalardan yeniden kurulur. Gömme vektörleri (`embeddings`) bilerek bu silmenin dışında: yeniden hesaplamak pahalı.
- FTS5 sanal tablosu `docs_fts`, `tokenize = 'unicode61 remove_diacritics 2'`. Türkçe harfler katlandığı için "kullanici" araması "Kullanıcı"yı bulur. Sıralama bm25, başlık ve özet daha ağır.
- `items` tablosu: kalem alanlarının yanında kurallardan gelen `terminal` ve `open_work` bayrakları, `reply_count`, ve pano kartı için `attachment_count`, `cover` (ilk resim ekinin adı), `level` (`fields.priority`, issue'da `fields.severity`), `due` (`fields.due`), `has_body`. Ek bilgisi dosya sisteminden (`ItemStore.fileSummary`) her yazımda, senkronda ve yeniden kurulumda alınır.
- `queryItems` `blocking DESC, updated_at DESC` sıralar; isteğe bağlı `visible` (bir `SqlFilter`, hub'da `Access.itemSql()`) LIMIT/OFFSET'ten önce uygulanır, böylece kısıtlı üyede sayfalar dolu ve `total` doğru.

## Artımlı güncelleme (`src/core/sync.ts`)
Bir dosya değiştiğinde (elle düzenleme, `git pull`, başka bir Cortex süreci) yalnızca o dosyanın işaret ettiği kayıt yeniden indekslenir.

- `mapPath(rel)` saf bir fonksiyon: yolu kayda çevirir (`tree/backend/_node.md` → düğüm `backend`, `items/<ULID>-<slug>/…` (yanıtlar ve `files/` ekleri dahil) → o kalem, `activity/<gün>/<aktör>.jsonl` → o günlük dosyası). Önce NFC'ye çevrilir (macOS ayrışık adlar verir) ve ayırıcılar normalize edilir.
- **Dosya düzeyinde değil, kayıt düzeyinde çalışır:** değişen dosyalar bir kayıt kümesine çevrilir, sonra her kayıt store'dan yeniden okunur — varsa `upsert`, yoksa `delete`. Yeniden adlandırma ve silme olay sırasından bağımsız doğru çözülür.
- Kayda bağlanamayan bir değişiklik (klasör olayı, kaybolan günlük dosyası, adsız FS olayı) → tam `reindex()`.
- Hata yalıtımı: bozuk tek bir dosya yalnızca kendi kaydını atlar, gerisi indekslenir.
- Kural dosyası değişince kalem dosyaları yeniden okunmaz; `retermItems` yalnızca `terminal` ve `open_work` bayraklarını yeniden hesaplar (ikisi de şemadan gelir).
- Hiçbir kayıt değişmediyse olay yayılmaz.
- `ItemStore` kimlik → klasör haritasını klasörün değişim zamanı değişince bir kez kurar; 2.000 kalemi okumak 5,1 sn → 2,0 sn (kare → doğrusal).

## Ölçülen davranış (2026-09-23)
Arama sorun değildi — 50 kat veriye karşılık 1,8 kat gecikme (FTS5 gerçek bir ters indeks):

| Düğüm | Kelime araması p50 | p95 | Tek düğüm yazma | İndeks boyutu |
|---|---|---|---|---|
| 100 | 12,9 ms | 15,8 ms | 5,7 ms | 0,8 MB |
| 1.000 | 14,7 ms | 22,4 ms | 15,2 ms | 6,8 MB |
| 5.000 | 22,7 ms | 42,7 ms | 26,4 ms | 30,5 MB |

Darboğaz tam yeniden kurulumdu ve maliyeti **toplam geçmişle** büyüyordu. Artımlı yoldan sonra (ağaç 50 düğümde sabit, yalnızca aktivite büyütülerek):

| Aktivite kaydı | Tam kurulum (eski yol) | Bir düğüm değişimi | Bir günlük dosyası |
|---|---|---|---|
| 500 | 108,9 ms | 4,1 ms | 8,6 ms |
| 5.000 | 418,1 ms | 5,1 ms | 72,5 ms |
| 20.000 | 1.649,7 ms | **12,7 ms** | 194,3 ms |

## Dikkat: `deleteDoc` FTS'te tam tarama yapar
`docs_fts`'te `kind` ve `ref` sütunları `UNINDEXED`, yani `deleteDoc` her çağrıldığında tüm FTS tablosunu tarar. Bu yüzden aktivite senkronunda zaten indekslenmiş kayıtlar `hasActivity` ile atlanır. Kalıcı çözüm (FTS satır numarasını `doc_text`'te tutmak) şema değişikliği ister, henüz yapılmadı.

## Henüz yapılmadı: açılışta artımlı olmak
Süreç açılışında hâlâ tam kurulum var (`Cortex` kurucusu `reindex()` çağırır). `aicortex mcp` her AI oturumunda yeni süreç açtığı için asıl kazanç orada olurdu. Tasarım: `indexed_files(path, mtime, size)` manifestosu, açılışta `stat` karşılaştırması; manifest `INDEX_VERSION` atlamasında **mutlaka** düşürülmeli.
