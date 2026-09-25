---
title: Pano sayfaları
summary: Her sayfa web/src/pages altında ayrı bir dosya. Kalem çekmecesi ve yeni
  kayıt penceresi web/src/items.tsx'te, ekler web/src/attachments.tsx'te.
  Tartışmaların ayrı liste ve detay ekranı var. Boş sayfalar EmptyState, yükleme
  iskelet satırlar. Tıklanan her satır klavyeyle de çalışır.
links:
  code:
    - file: web/src/pages
    - file: web/src/items.tsx
    - file: web/src/attachments.tsx
    - file: web/src/SchemaForm.tsx
    - file: web/src/hub.tsx
    - file: web/src/ui.tsx
verified_at_commit: 4a005676941ea541e4c54fb5a19eb7183a44bee7
id: 01M34QY9ZWPSMQ85J1ACFRTWTS
status: active
updated_by: ai-agent
updated_at: 2026-09-24T21:20:24.903Z
---

- Bildirimler (`pages/Inbox.tsx`): tek satırlık özet ve başlığı, sayısı, bir cümlelik açıklaması olan gruplar: işi durduran sorular, sana atananlar, grubunu bekleyenler, cevaplanan soruların, yeni yanıtlar, görüşünü bekleyen tartışmalar, kararlar, onay bekleyen taslaklar, eskimiş bilgi (yalnızca yüksek ve orta derece). Tartışma satırı çekmece yerine tartışma ekranını açar.
- Pano (`pages/Board.tsx`): başlıkta sayfa adı, türün açıklaması ve tek ana eylem ("Yeni"); tür, dal ve atanan filtreleri altında ayrı bir satırda (`.board-filters`). Tür başına kanban, Trello tarzı kart: ilk resim eki kapak, öncelik (issue'da önem) renkli etiket, son tarih rozeti (geçtiyse kırmızı, bugünse turuncu, bitince yeşil), açıklama / yanıt / ek rozetleri, sağda atanan. Her sütunun altında "Kart ekle": başlık + Enter, kart o sütuna düşer, giriş açık kalır. Kartta "Şuraya taşı" menüsü (klavye ve dokunmatik için sürüklemenin karşılığı), taşıma `aria-live` ile duyurulur. `discussion` türü panoda ve yeni kayıt penceresinde yok.
- **Sütunlar kendi içinde kayar:** pano sayfası pencereyi doldurur, her sütun görünür alana göre kendini sınırlar, kart listesi kayar ve "Kart ekle" altta kalır. Kartlara `flex-shrink: 0` verilmesi şart.
- **Tartışmalar** (`pages/Discussions.tsx`, `backend/discussions`):
  - Liste (`#/discussions`): Sürenler / Tümü filtresi, kart ızgarası. Kartta durum, "Görüşünü bekliyor" işareti, seçenekler ve oy çubukları (kör turda sayısız), katılımcı avatarları (yazmayan soluk). Boşsa "Yeni tartışma" eylemli boş durum.
  - "Yeni tartışma" penceresi: soru, arka plan, 2-8 seçenek, katılımcı seçimi (boşsa herkes), son tarih, bilgi dalı, kör ilk tur (varsayılan açık).
  - Detay (`#/discussions/<id>`): üstte aşama açıklaması; "Seçeneğe göre" ya da "Akış" görünümü; görüş kartında tür, güven, desteklenen seçenek ve kanıt bağlantıları. Kör turda başkalarının görüşleri kilitli kart.
  - Görüş kutusu aşamaya göre tür sunar: açıkken Görüş ve Yorum, tartışılırken İtiraz ve Sentez de.
  - Sağ panel: oylar, katılımcılar, karar. "Görüşleri aç", "Oyları say", "Tartışmaya geri dön", "İptal et" (`write_items`); önerilen kararı "Kabul et" ve seçenek başına "Bununla karar ver" yalnızca `approve` yetkili insanda. Önerilen seçenekle "Bununla karar ver" mevcut öneriyi kabul eder.
  - Kalem çekmecesi bir tartışma açılırsa kendini kapatıp tartışma ekranına yönlendirir.
- **Boş ve yükleniyor durumları** (`EmptyState`, `Loading`, `web/src/ui.tsx`): Bildirimler, Tartışmalar, Arama, Aktivite, Onaylar ve Eskimiş bilgi boşken ikon, anlamı ve varsa sıradaki adımı gösterir. Hub ekranları ve Bilgi sayfası hâlâ eski `.empty` (görev `01M3AJF3RYE2NB30ZNVAAB0595`).
- Kalem çekmecesi (`items.tsx`): üstte Durum ve Atanan seçicileri (tek başına değiştirir). Açıklama yerinde düzenlenir (Yaz / Önizle), altında Ekler ızgarası (önizleme penceresi: resim, işlenmiş Markdown, metin; indir / açıklamaya ekle / kaldır). Ekran görüntüsü yapıştırmak ya da dosya sürüklemek eke dönüşür; Markdown'daki `files/<ad>` aynı kalemin ekini gösterir.
- **Yanıt kutusunun altındaki durum seçicisi yazı istemez:** hiçbir şey yazılmadıysa düğme "Şuraya taşı: <durum>" olur ve kartlardaki ile aynı PATCH'i yapar.
- Yeni kayıt penceresi: aynı yapıştır / bırak / seç; dosyalar tarayıcıda bekler (blob: önizleme), kayıt oluşunca yüklenir.
- Bilgi: ağaç (ad bir bağlantı, `aria-current`; açma/kapama ayrı düğme), markdown, kod bağlantıları; eskimiş düğümde derece, "Hâlâ doğru", "Düzelt" ve (insanlar için) "Ertele".
- Eskimiş bilgi (`pages/Stale.tsx`): dereceye göre gruplar, satır başına Doğrula / Düzelt / Ertele, "biçimsel olanların hepsini doğrula".
- Arama, Aktivite, Onaylar (onaydan sonra kod değişmişse "HEAD'de doğrula"), Raporlar, Kurallar, Hub ekranları, Kılavuz: önceki gibi.
- Pencereler: Escape yalnızca en üstteki pencereyi kapatır (`useEscape` yığını).
- Erişilebilirlik: tıklanan ama `<button>` olamayan her şey `Pressable`; etiketler `htmlFor`/`id` ile bağlı; jsx-a11y kuralları lint'te hata seviyesinde.
- Rolün izin vermediği düğmeler gizlenir (`useSession().can(perm)`); asıl denetim sunucuda.
