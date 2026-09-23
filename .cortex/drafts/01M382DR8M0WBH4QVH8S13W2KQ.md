---
kind: node
target: code-structure/gotchas
proposed_by: ai-agent
reason: "S6-S7'de bulunan tuzaklar: git'in Türkçe yolları tırnaklaması, NFD, SSE
  dinleyici uyarısı, ölçüm yanılgısı."
base_rev: 4b737703
id: 01M382DR8M0WBH4QVH8S13W2KQ
proposed_at: 2026-09-23T21:23:24.052Z
data:
  path: code-structure/gotchas
  title: Bilinen tuzaklar
  summary: "node:sqlite: FTS5 ancak Node 22.16'dan itibaren; numaralı parametre
    (?1) yok; uyarı filtresinden önce yüklenmemeli. SQL LIKE'ta _ joker. git
    Türkçe yolları tırnaklar (core.quotepath=false), macOS NFD verir. Windows'ta
    git çağrısı ~20 ms. Satır sonları LF."
  links:
    code:
      - file: src/index/db.ts
      - file: src/git/git.ts
      - file: src/cli.ts
  verified_at_commit: f294f6f
  id: 01M34QYABJE3KGV82NE6BGAWEK
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-23T21:23:24.045Z
---

- **En düşük Node 22.16**: 22.13, 22.14 ve 22.15'teki node:sqlite FTS5 içermiyor, Cortex hiç açılmıyordu. Yerelde 22.16 kullanıldığı için CI'daki en eski sürüm testine kadar fark edilmedi.
- **node:sqlite parametreleri**: `?1` gibi numaralı yer tutucular çalışmıyor; `:ad` ya da düz `?` kullan.
- **LIKE ve alt çizgi**: dosya adlarındaki `_` joker gibi eşleşiyordu; kod bağlantısı aramaları birebir karşılaştırıyor. Görünürlük SQL'i (`itemSql`) dal adlarını `ESCAPE '\'` ile kaçışlar.
- **git ve Türkçe karakterli yollar**: git varsayılan olarak ASCII dışı yolları tırnaklayıp sekizli kaçışla yazar (`"src/\303\266deme.ts"`). Bu yüzden adında ö/ş/ı olan bağlı dosyalar hiç eskimiş görünmüyordu. `Git.run` her çağrıda `-c core.quotepath=false` verir ve çıktıyı NFC'ye çevirir.
- **NFC/NFD**: macOS dosya adlarını ayrışık (NFD: o + birleşik iki nokta) bildirir. Bağlı dosya yolları (düğüm ve kalem şeması), kod bağlamı girdisi, izleyici yolları (`mapPath`) ve git çıktısı NFC'ye çevrilir; aynı dosya her sistemde aynı anahtar olur.
- **ExperimentalWarning**: `src/cli.ts` SQLite uyarısını gizler; ondan önce hiçbir şey node:sqlite yüklememeli.
- **Taşıma tespiti**: `git diff` bağlı yolla sınırlanınca taşınan dosyanın yeni yeri görünmüyor; silinmiş görünen dosyalar için ayrıca kontrol ediliyor.
- **HEAD kontrolü**: 5 saniyede bir (`Cortex.watch`); Windows'ta her git çağrısı yaklaşık 20 ms. Eskime git cevaplarını HEAD başına önbelleğe alır; aynı HEAD'de yeniden hesaplama git'e yeniden sormaz.
- **Performans ölçümü**: `new Cortex` indeksi açarken kalem klasörü haritasını zaten ısıtır; "soğuk reindex" ölçümü bu yüzden kalem aramasındaki kare maliyeti göstermez. Taze bir `ItemStore` ile ölçülmeli.
- **Statik dosyalar ve yeniden derleme**: `@fastify/static` `wildcard: false` ile dosya listesini yalnızca açılışta çıkarıyordu; sunucu açıkken derlenen pano boş sayfa gösteriyordu (yeni JS dosyası yerine HTML dönüyordu). Önceki teşhis "tarayıcı önbelleği" yanlıştı. Artık `wildcard: true` ve eksik dosyada 404.
- **Brief boyutu**: 800 token sınırı testle korunuyor; listeler "sayı + ilk 5" şeklinde tutulur.
- **SSE ve dinleyici uyarısı**: her açık pano `cortex.events`'e bir dinleyici ekler; 11. panoda Node `MaxListenersExceededWarning` verir. `/events` sınırı (50) ile birlikte `setMaxListeners` ayarlanır.
