---
title: İndeks ve kelime araması
summary: "node:sqlite önbelleği; düğümler, kalemler ve aktivite üzerinde FTS5
  kelime araması. Türkçe harfler katlanır. İndeks artımlı güncellenir: bir dosya
  değişiminde yalnızca o kayıt yeniden indekslenir, her şey baştan kurulmaz."
links:
  code:
    - file: src/index/db.ts
    - file: src/core/sync.ts
    - file: src/core/cortex.ts
    - file: src/store/activity.ts
verified_at_commit: 37b10026e6dc9aa45dcb40ece3b24dd477147d68
id: 01M34QY9AVGX8V5NP7DDB49TM1
status: active
updated_by: ai-agent
updated_at: 2026-09-23T00:03:43.002Z
---

- `src/index/db.ts`: `node:sqlite`, WAL, `INDEX_VERSION` değişince tablolar düşürülüp dosyalardan yeniden kurulur. Gömme vektörleri (`embeddings`) bilerek bu silmenin dışında: yeniden hesaplamak pahalı.
- FTS5 sanal tablosu `docs_fts`, `tokenize = 'unicode61 remove_diacritics 2'`. Türkçe harfler katlandığı için "kullanici" araması "Kullanıcı"yı bulur. Sıralama bm25, başlık ve özet daha ağır.
- Kalem/düğüm/aktivite sorguları düz tablolardan; `queryItems` `blocking DESC, updated_at DESC` sıralar.

## Artımlı güncelleme (`src/core/sync.ts`)
Bir dosya değiştiğinde (elle düzenleme, `git pull`, başka bir Cortex süreci) yalnızca o dosyanın işaret ettiği kayıt yeniden indekslenir.

- `mapPath(rel)` saf bir fonksiyon: yolu kayda çevirir (`tree/backend/_node.md` → düğüm `backend`, `items/<ULID>-<slug>/replies/<id>.md` → o kalem, `activity/<gün>/<aktör>.jsonl` → o günlük dosyası). Windows'ta izleyici ters bölü verdiği için önce ayırıcılar normalize edilir.
- **Dosya düzeyinde değil, kayıt düzeyinde çalışır:** değişen dosyalar bir kayıt kümesine çevrilir, sonra her kayıt store'dan yeniden okunur — varsa `upsert`, yoksa `delete`. Yeniden adlandırma (`a/b.md` → `a/b/_node.md`) ve silme, olay sırasından bağımsız olarak doğru çözülür.
- Kayda bağlanamayan bir değişiklik (klasör olayı, kaybolan günlük dosyası, adsız FS olayı) → tam `reindex()`. Güvenli taraf.
- Hata yalıtımı: bozuk tek bir dosya yalnızca kendi kaydını atlar, gerisi indekslenir, sonraki olayda yeniden denenir. Eskiden tek bir yarım dosya tüm kurulumu patlatıyordu.
- Kural dosyası değişince kalem dosyaları yeniden okunmaz; `retermItems` yalnızca `terminal` sütununu yeniden hesaplar (o bayrak şemadan gelir, dosyadan değil).
- Hiçbir kayıt değişmediyse olay yayılmaz, yoksa boş FS olayları semantic debounce'u ve eskime kontrolünü boşuna tetikler.

## Ölçülen davranış (2026-09-23)
Arama zaten sorun değildi ve değişmedi — 50 kat veriye karşılık 1,8 kat gecikme (FTS5 gerçek bir ters indeks):

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

Önemli olan sayının küçülmesi değil, **neye bağlı olduğunun değişmesi**: maliyet artık toplam geçmişle değil, yalnızca o günün hacmiyle sınırlı.

## Dikkat: `deleteDoc` FTS'te tam tarama yapar
`docs_fts`'te `kind` ve `ref` sütunları `UNINDEXED`, yani `deleteDoc` her çağrıldığında tüm FTS tablosunu tarar. Bu yüzden aktivite senkronunda **zaten indekslenmiş kayıtlar `hasActivity` ile atlanır**, silinip yeniden yazılmaz. Bu yol bir kez denendi ve tam yeniden kurulumu 20.000 kayıtta 1,6 sn'den 107 sn'ye çıkardı (kayıt başına bir tam tarama). Aynı tuzak düğüm/kalem yazımında da var ama oradaki maliyet ılımlı (6.000 belgede 11,8 ms). Kalıcı çözüm: `doc_text` içinde FTS satır numarasını tutup `DELETE ... WHERE rowid = ?` yapmak — şema değişikliği gerektirir, henüz yapılmadı.

## Henüz yapılmadı: açılışta artımlı olmak
Süreç açılışında hâlâ tam kurulum var (`Cortex` kurucusu). `aicortex mcp` her AI oturumunda yeni süreç açtığı için asıl kazanç orada olurdu. Tasarımı hazır: `indexed_files(path, mtime, size)` manifestosu, açılışta `stat` ile karşılaştırma, yalnızca değişenleri okuma. Manifest `INDEX_VERSION` atlamasında **mutlaka** düşürülmeli, yoksa veri tabloları silinirken manifest hayatta kalır ve indeks kalıcı olarak boş kalır.
