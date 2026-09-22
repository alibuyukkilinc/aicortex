---
title: Pano sayfaları
summary: Her sayfa web/src/pages altında ayrı bir dosya. Kalem çekmecesi ve soru
  sorma penceresi web/src/items.tsx'te; kalem formları kurallardan otomatik
  üretilir (web/src/SchemaForm.tsx).
tags:
  - web
links:
  code:
    - file: web/src/pages
    - file: web/src/items.tsx
    - file: web/src/SchemaForm.tsx
    - file: web/src/hub.tsx
    - file: web/src/pages/Guide.tsx
    - file: web/src/pages/Inbox.tsx
verified_at_commit: da2b11a97658129d06087801ccfc2a5b7acf5b2f
id: 01M34QY9ZWPSMQ85J1ACFRTWTS
status: active
updated_by: ai-agent
updated_at: 2026-09-22T19:28:28.280Z
---

- Bildirimler (`pages/Inbox.tsx`): tek satırlık özet ("5 şey seni bekliyor · 2 taslak onayını bekliyor") ve başlığı, sayısı, bir cümlelik açıklaması olan gruplar: işi durduran sorular, sana atananlar, grubunu bekleyenler, cevaplanan soruların, yeni yanıtlar, kararlar, onay bekleyen taslaklar, eskimiş bilgi. Pano: tür başına kanban; yasak geçişler soluk ve açıklamalı.
- Bilgi: ağaç, markdown, kod bağlantıları; üstte yol (root / backend / …) ve işlem düğmeleri aynı satırda, başlık altında tam genişlikte; eskimiş düğümde "Hâlâ doğru" ve "Düzenle" düğmeleri; kök dışındaki düğümlerde "Sil" (sunucu reddederse nedeni gösterilir).
- Arama: taslak sonuçlar "taslak, onay bekliyor" etiketiyle görünür, tıklayınca Onaylar'a gider.
- Aktivite: canlı akış, her kayıtta "bunu sor" düğmesi.
- Onaylar: mevcut ve önerilen yan yana; onay kutularıyla toplu onay/ret, işlenemeyenler seçili kalır.
- Kalem formu ve ayrıntı paneli: alanlar kurallardan üretilir, hazır alan ve seçenek adları çevrilir (`SchemaForm`, `FieldRow`).
- Raporlar: başlıktaki dönem ve dışa aktarma düğmeleri tek grup; özet kutuları, grafikler, listeler, markdown kopyala/indir. Kurallar: YAML düzenleyici, geçersiz kural kaydedilmez.
- Hub ekranları (`web/src/hub.tsx`): giriş, davet, projelerim, organizasyon (kişiler, AI ajanları, projeler; davet bağlantısı ve token bir kez gösterilir), proje Üyeler sayfası (rol, görür, dallar). Üst çubukta proje değiştirici ve hesap menüsü.
- Kılavuz (`pages/Guide.tsx`): sistem nasıl işler, sıradan bir gün, AI bağlantısı (MCP komutu sunucuya ve projeye göre hazır yazılır), rol tablosu, mobil ekip örneği, terimler sözlüğü.
- İngilizce terimler: `GLOSSARY` (`web/src/i18n.ts`) + `<Term w="commit">`; üstüne gelince açıklama çıkar. Aktivite eylemleri ve arama sonucu türleri çevrilir, ham hâli ipucunda kalır.
- Rolün izin vermediği düğmeler gizlenir (`useSession().can(perm)`); asıl denetim sunucuda.
