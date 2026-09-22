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
verified_at_commit: 22cc2549d317b2e5d2c6e4dbb92b402671c7213f
id: 01M34QY9ZWPSMQ85J1ACFRTWTS
status: active
updated_by: ai-agent
updated_at: 2026-09-22T17:21:53.499Z
---

- Gelen kutusu: seni bekleyenler, engelleyiciler üstte. Pano: tür başına kanban; yasak geçişler soluk ve açıklamalı.
- Bilgi: ağaç, markdown, kod bağlantıları; üstte yol (root / backend / …) ve işlem düğmeleri aynı satırda, başlık altında tam genişlikte; eskimiş düğümde "Hâlâ doğru" ve "Düzenle" düğmeleri; kök dışındaki düğümlerde "Sil" (sunucu reddederse nedeni gösterilir).
- Arama: taslak sonuçlar "taslak, onay bekliyor" etiketiyle görünür, tıklayınca Onaylar'a gider.
- Aktivite: canlı akış, her kayıtta "bunu sor" düğmesi.
- Onaylar: mevcut ve önerilen yan yana; onay kutularıyla toplu onay/ret, işlenemeyenler seçili kalır.
- Kalem formu ve ayrıntı paneli: alanlar kurallardan üretilir, hazır alan ve seçenek adları çevrilir (`SchemaForm`, `FieldRow`).
- Raporlar: başlıktaki dönem ve dışa aktarma düğmeleri tek grup; özet kutuları, grafikler, listeler, markdown kopyala/indir. Kurallar: YAML düzenleyici, geçersiz kural kaydedilmez.
- Hub ekranları (`web/src/hub.tsx`): giriş, davet, projelerim, organizasyon (kişiler, AI ajanları, projeler; davet bağlantısı ve token bir kez gösterilir), proje Üyeler sayfası (rol, görür, dallar). Üst çubukta proje değiştirici ve hesap menüsü.
- Rolün izin vermediği düğmeler gizlenir (`useSession().can(perm)`); asıl denetim sunucuda.
