---
id: 01M37T6FSHPVN2DHHB4T1F3GPZ
author: ai-agent
created_at: 2026-09-23T18:59:37.393Z
status_change:
  from: open
  to: closed
fields:
  resolution: fixed
  commits:
    - 1fe3051
  files:
    - src/core/schema.ts
    - src/index/db.ts
    - src/core/cortex.ts
    - src/core/items.ts
    - src/core/sync.ts
    - src/core/reports.ts
    - test/open-items.test.ts
---

Şemaya `resolved` diye isteğe bağlı ikinci bir liste eklendi: "işi bitmiş ama hâlâ hareket edebilir". Karar türü için varsayılanı `[accepted]`. `terminal` eski anlamını koruyor ("buradan çıkan geçiş yok") ve hem geçiş kontrolünü hem raporlardaki "kapandı" sayımını sürdürüyor; böylece `accepted → superseded` geçişi yasal kalıyor. İndekste artık iki bayrak var (`open_work`, `terminal`) ve ikisi de mevcut reterm yolundan tazeleniyor, yani kural değişince hiçbir kalem dosyası yeniden okunmadan karar yeniden veriliyor.

Şema dosyasına değil koda yazıldı: şema dosyaları `init` anında diske yazıldığı için yalnızca şemayı düzeltmek mevcut projeleri düzeltmezdi. `loadSchema` eksik anahtarda yerleşik varsayılana düşüyor, dolayısıyla bu anahtar yokken kurulmuş projeler güncellemeyle düzeliyor.

Bu repoda ölçüldü: açık kayıt 19 → 6, backend dalı 15 → 3, owner gelen kutusu 3 → 2 (kalan ikisi gerçekten insanı bekleyen kayıtlar).
