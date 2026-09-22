---
title: Kod bağlantıları ve eskime tespiti
summary: Düğümler koda bağlanır (dosya, klasör, isteğe bağlı satır aralığı).
  Düğüm yazılınca o anki commit'e sabitlenir; sonra bağlı satırlara dokunan bir
  commit gelirse 'eskimiş olabilir' olur. Git'ten hesaplanır, dosyalara
  yazılmaz.
tags:
  - git
  - eskime
links:
  code:
    - file: src/git/git.ts
    - file: src/core/staleness.ts
verified_at_commit: d974755195f2cbd8301ad42d39a41c6250682b77
id: 01M34QY9MHTMEP4XJH25MGX34H
status: active
updated_by: ai-agent
updated_at: 2026-09-22T14:35:00.930Z
---

- `Git` (`src/git/git.ts`) git komutunu çağırır; hata olursa "bilinmiyor" sayar. "Git deposu değil" sonucu 30 saniyede bir yeniden kontrol edilir.
- `StalenessService` bağlı yollar için `verified_at_commit..HEAD` farkına bakar; satır aralığı varsa yalnızca o satırlara dokunan değişiklikleri sayar.
- Silinen ve taşınan dosyalar ayrıca raporlanır (silinmiş görünen dosyalar için taşıma kontrolü tekrar yapılır).
- Sabitlenen commit artık yoksa (geçmiş yeniden yazılmışsa) `unknown_commit` olur ve eskimiş sayılır.
- Kaydedilmemiş değişiklikler sayılmaz. Yalnızca bilgi düğümleri eskir; kalemler koda bağlanabilir ama yalnızca ters aramada görünür.
- `codeContext(files)`: "Bu dosyaları hangi bilgi, karar ve açık iş kapsıyor?" sorusunu cevaplar.
- `verifyNode`: içeriği değiştirmeden sabitlemeyi HEAD'e taşır ("hâlâ doğru"). AI yaparsa taslak olur.
