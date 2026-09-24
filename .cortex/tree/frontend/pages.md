---
title: Pano sayfaları
summary: Her sayfa web/src/pages altında ayrı bir dosya. Kalem çekmecesi ve yeni
  kayıt penceresi web/src/items.tsx'te, ekler web/src/attachments.tsx'te; pano
  kartları Trello tarzı (kapak, etiket, tarih, rozetler, "Kart ekle"). Tıklanan
  her satır klavyeyle de çalışır.
links:
  code:
    - file: web/src/pages
    - file: web/src/items.tsx
    - file: web/src/attachments.tsx
    - file: web/src/SchemaForm.tsx
    - file: web/src/hub.tsx
    - file: web/src/ui.tsx
verified_at_commit: 0ee05a38f206a18ec39a2854c47b1a9fa4f57476
id: 01M34QY9ZWPSMQ85J1ACFRTWTS
status: active
updated_by: ai-agent
updated_at: 2026-09-24T07:30:11.288Z
---

- Bildirimler (`pages/Inbox.tsx`): tek satırlık özet ve başlığı, sayısı, bir cümlelik açıklaması olan gruplar: işi durduran sorular, sana atananlar, grubunu bekleyenler, cevaplanan soruların, yeni yanıtlar, kararlar, onay bekleyen taslaklar, eskimiş bilgi (yalnızca yüksek ve orta derece).
- Pano (`pages/Board.tsx`): tür başına kanban, Trello tarzı kart: ilk resim eki kapak, öncelik (issue'da önem) renkli etiket, son tarih rozeti (geçtiyse kırmızı, bugünse turuncu, bitince yeşil), açıklama / yanıt / ek rozetleri, sağda atanan. Her sütunun altında "Kart ekle": başlık + Enter, kart o sütuna düşer, giriş açık kalır. Kartta "Şuraya taşı" menüsü (klavye ve dokunmatik için sürüklemenin karşılığı), taşıma `aria-live` ile duyurulur.
- Kalem çekmecesi (`items.tsx`): açıklama yerinde düzenlenir (Yaz / Önizle), altında Ekler ızgarası (küçük resimler, önizleme penceresi: resim, işlenmiş Markdown, metin; oklarla dosyalar arası; indir / açıklamaya ekle / kaldır). Çekmece açıkken ekran görüntüsü yapıştırmak (Ctrl+V) ya da dosya sürüklemek eke dönüşür; açıklamaya veya yanıta yapıştırınca `![..](<files/..>)` imlecin yerine girer. Markdown'daki `files/<ad>` aynı kalemin ekini gösterir (`<Markdown files>`).
- Yeni kayıt penceresi: aynı yapıştır / bırak / seç; dosyalar tarayıcıda bekler (önizleme blob: adresleriyle), kayıt oluşunca yüklenir.
- Bilgi: ağaç (ad bir bağlantı, `aria-current`; açma/kapama ayrı düğme), markdown, kod bağlantıları; eskimiş düğümde derece, "Hâlâ doğru", "Düzelt" ve (insanlar için) "Ertele".
- Eskimiş bilgi (`pages/Stale.tsx`): dereceye göre gruplar, satır başına Doğrula / Düzelt / Ertele, "biçimsel olanların hepsini doğrula".
- Arama, Aktivite, Onaylar (onaydan sonra kod değişmişse "HEAD'de doğrula"), Raporlar, Kurallar, Hub ekranları, Kılavuz: önceki gibi.
- Pencereler: Escape yalnızca en üstteki pencereyi kapatır (`useEscape` yığını, `web/src/ui.tsx`).
- Erişilebilirlik: tıklanan ama `<button>` olamayan her şey `Pressable`; etiketler `htmlFor`/`id` ile bağlı; jsx-a11y kuralları lint'te hata seviyesinde.
- Rolün izin vermediği düğmeler gizlenir (`useSession().can(perm)`); asıl denetim sunucuda.
