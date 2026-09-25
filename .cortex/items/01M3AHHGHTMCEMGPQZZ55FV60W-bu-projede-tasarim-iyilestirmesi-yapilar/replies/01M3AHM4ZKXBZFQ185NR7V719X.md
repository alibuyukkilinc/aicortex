---
id: 01M3AHM4ZKXBZFQ185NR7V719X
author: ai-agent
created_at: 2026-09-24T20:27:31.187Z
fields:
  kind: opinion
  stance: Evet gidelim
  confidence: medium
  evidence:
    - web/src/styles.css:280
    - web/src/styles.css:1911
    - web/src/items.tsx
    - web/src/pages/Reports.tsx
    - web/src/ui.tsx:195
    - frontend/design-system
---

**Evet, ama görünümü değiştirerek değil, tutarlılığı sıkılaştırarak.** Temel sağlam: tek vurgu rengi, üç temada da tanımlı değişkenler, çerçevesiz kartlar, sistem yazı tipi. Ürünü "profesyonel" gösterecek olan yeni bir stil değil, bu sistemin her ekranda aynı disiplinle uygulanması. Kodda bunun eksik olduğu yerler somut olarak görülüyor:

1. **Satır içi stiller:** TSX dosyalarında 142 `style={{…}}` var (items.tsx 28, Reports 25, Knowledge 16, hub 14). Bunlar değişkenleri ve boşluk ölçeğini atlıyor; ekranlar arası küçük kaymaların kaynağı bu.
2. **Yazı boyu ölçeği dağılmış:** styles.css'te 14 farklı px değeri var (9, 9,5, 11, 11,5, 12, 12,5, 13, 13,5, 14, 15, 16, 17, 22, 26). Bilgi ağacındaki kural "en küçük 11 px" diyor ama 9 ve 9,5 px de kullanılıyor (bunların ikisi benim eklediğim tartışma avatarları, düzeltilmeli). 6-7 adımlık bir `--text-*` ölçeği yeterli.
3. **Değişken dışı renkler:** tema bloklarının dışında 15 sabit hex/rgba değer var (toast, vurgulama, beyaz metin). Koyu/açık temada ayrı ayarlanamıyorlar.
4. **Bekleme ve boş durumlar:** her sayfada yükleme, düz "Yükleniyor…" metni; boş liste, tek satırlık bir kart. İskelet (skeleton) satırlar ve eylem öneren boş durumlar ürünü en çok "bitmiş" gösteren şeyler.
5. **Kırılma noktaları:** 860, 1100, 1180, 560, 600 px karışık; iki-üç ortak değere indirilmeli.

**Glassmorfizm neden olmasın:** zaten yerinde kullanılıyor: üst çubuk, kenar çubuğu ve pencere arka planları `backdrop-filter: blur(20px)`. Bunu kartlara ve listelere yaymak bu üründe zarar verir: (a) Cortex yoğun metin ve tablo gösteriyor, yarı saydam zemin kontrastı düşürür; (b) cam etkisi renkli bir arka plan ister, bu da tasarım kuralındaki "gradyan ve neon yok" ilkesiyle çelişir; (c) her kartta blur, uzun panolarda ve zayıf makinelerde kaydırmayı yavaşlatır.

**Önerim:** 1-2 turluk bir "tasarım borcu" işi: yazı boyu ve boşluk ölçeğini değişkene bağla, satır içi stilleri sınıflara taşı, sabit renkleri değişkene çevir, iskelet yükleme ve boş durum bileşeni ekle. Görsel dil aynı kalır, her ekran aynı sistemden çıkar.
