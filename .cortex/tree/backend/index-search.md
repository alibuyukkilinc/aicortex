---
title: İndeks ve kelime araması
summary: node:sqlite önbelleği; düğümler, kalemler ve aktivite üzerinde FTS5
  kelime araması. Türkçe harfler katlanır; tüm kelimeler yazıldığı gibi
  bulunmazsa kökleriyle de aranır ("ertelemek" → "erteleme"). İndeks artımlı
  güncellenir. Kalem satırı pano kartını da taşır.
links:
  code:
    - file: src/index/db.ts
    - file: src/core/sync.ts
    - file: src/core/cortex.ts
    - file: src/store/activity.ts
verified_at_commit: 0075bcc9666bd04ac2944f61708fce36ad012dac
id: 01M34QY9AVGX8V5NP7DDB49TM1
status: active
updated_by: ai-agent
updated_at: 2026-09-24T20:09:06.668Z
---

- `src/index/db.ts`: `node:sqlite`, WAL, `INDEX_VERSION` (şu an 7) değişince tablolar düşürülüp dosyalardan yeniden kurulur. Gömme vektörleri (`embeddings`) bilerek bu silmenin dışında: yeniden hesaplamak pahalı.
- FTS5 sanal tablosu `docs_fts`, `tokenize = 'unicode61 remove_diacritics 2'`. Türkçe harfler katlandığı için "kullanici" araması "Kullanıcı"yı bulur. Sıralama bm25, başlık ve özet daha ağır.
- `items` tablosu: kalem alanlarının yanında kurallardan gelen `terminal` ve `open_work` bayrakları, `reply_count`, ve pano kartı için `attachment_count`, `cover` (ilk resim ekinin adı), `level` (`fields.priority`, issue'da `fields.severity`), `due` (`fields.due`), `has_body`. Ek bilgisi dosya sisteminden (`ItemStore.fileSummary`) her yazımda, senkronda ve yeniden kurulumda alınır.
- Kalemin arama metni gövde + metin alanları + yanıtlardır. İstisna: kör turdaki bir tartışmanın (`isSealed`, `src/core/discussions.ts`) yanıtları indekse girmez, yoksa bir katılımcı başkalarının görüşünü aramayla okuyabilirdi. Tartışma `deliberating`'e geçince kayıt yeniden yazılır ve görüşler aranabilir olur. Kural `insertItem` içinde olduğu için yazım, senkron ve tam kurulumun hepsinde geçerli; anlamla arama da aynı metni kullanır.
- `queryItems` `blocking DESC, updated_at DESC` sıralar; isteğe bağlı `visible` (bir `SqlFilter`, hub'da `Access.itemSql()`) LIMIT/OFFSET'ten önce uygulanır, böylece kısıtlı üyede sayfalar dolu ve `total` doğru.

## Sorgu adımları (`Index.search`)
Her kelime önek olarak aranır (`"kelime"*`). Sırayla:
1. **Tüm kelimeler, yazıldığı gibi** (AND). Sonuç varsa biter.
2. **Tüm kelimeler, kökleriyle** (AND; her kelime `("kelime"* OR "kök"*)`). `stem()`: sondan en çok 3 harf atar, 5 harfin altına inmez; 5 harf ve kısası hiç kesilmez. Türkçe ekler köke ekleniyor ("ertelemek" → "ertele" → "erteleme", "ertelenebilir"). Tam kelime iki koşula da uyduğu için yine önde çıkar.
3. Sayfa dolmadıysa **herhangi bir kelime** (OR, yazıldığı gibi, dolgu sözcükleri hariç) kalan yeri doldurur.
- Kökler bilerek yalnızca 2. adımda: 1. adımda ya da 3. adımda kullanılınca 20 sorguluk ölçümde sonuç kötüleşti (doğru olan eşleşmeleri genişletip aşağı itti). 2. adımdan sonra 3. adımın eklenmesi de şart: birkaç yanlış kök eşleşmesi, eskiden "herhangi bir kelime" ile gelen doğru kaydı saklıyordu. Ölçüm ve tablo: `docs/BENCHMARKS.md` (5. tur, commit 9b26efb).
- Bilinen sınır: İngilizce soruyla Türkçe kaydı kelime araması bulamaz; ajanlar sorguyu Türkçeye çevirerek kapatıyor. Anlamla arama bu farkı ölçümde kapatmadı (`backend/semantic-search`).

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
Süreç açılışında hâlâ tam kurulum var (`Cortex` kurucusu `reindex()` çağırır). `cortexboard mcp` her AI oturumunda yeni süreç açtığı için asıl kazanç orada olurdu. Tasarım: `indexed_files(path, mtime, size)` manifestosu, açılışta `stat` karşılaştırması; manifest `INDEX_VERSION` atlamasında **mutlaka** düşürülmeli.
