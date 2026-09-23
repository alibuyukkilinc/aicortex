---
kind: node
target: backend/staleness
proposed_by: ai-agent
reason: S3 derecelendirme, erteleme, onayda yeniden sabitleme ve aktivite
  kaydında eskime bildirimi ekledi; düğüm eski davranışı anlatıyordu.
base_rev: 9499b36e
id: 01M380YSAQPEM3Q5JS0PNXHTPG
proposed_at: 2026-09-23T20:57:45.047Z
data:
  path: backend/staleness
  title: Kod bağlantıları ve eskime tespiti
  summary: "Düğümler koda bağlanır, yazılınca ya da onaylanınca commit'e
    sabitlenir. Kod sonradan değişirse eskir: yüksek (bağlı satır, silme,
    taşıma), orta (dosyanın başka yeri), düşük (yalnızca biçim). Yalnızca yüksek
    ve orta sayılır. Ertelenebilir. Git'ten hesaplanır."
  links:
    code:
      - file: src/git/git.ts
      - file: src/core/staleness.ts
      - file: web/src/pages/Stale.tsx
  verified_at_commit: e3f0a0a
  id: 01M34QY9MHTMEP4XJH25MGX34H
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-23T20:57:45.044Z
---

- `Git` (`src/git/git.ts`) git komutunu çağırır; hata olursa "bilinmiyor" sayar. "Git deposu değil" sonucu 30 saniyede bir yeniden kontrol edilir. `formattingOnly` = `git diff -w --ignore-blank-lines --quiet` (çıkış 0: yalnızca boşluk/boş satır değişmiş).
- `StalenessService` bağlı yollar için `verified_at_commit..HEAD` farkına bakar; satır aralığı varsa yalnızca o satırlara dokunan değişiklikleri sayar (aralık dışı değişiklik eskitmez).
- Derece (`severity`): **yüksek** = dosya silinmiş/taşınmış ya da bağlı satır aralığına dokunulmuş; **orta** = aralıksız bağlı dosya gerçekten değişmiş, ya da sabitlenen commit artık yok (`unknown_commit`); **düşük** = yalnızca biçimsel. Düğümün derecesi değişikliklerinin en kötüsü.
- `actionable(s)` = düşük değil ve ertelenmemiş. Brief, gelen kutusu, ağaçtaki "stale" durumu, `codeContext` ve menü sayacı yalnızca bunları sayar. Rapor `knowledge.stale` eyleme değerleri, `stale_info` geri kalanı gösterir.
- Erteleme: yalnızca insanlar (`POST/DELETE /api/snooze/<path>`). `.cortex/.index/snoozes.json` içinde, git'e girmez; dosya değişim zamanıyla yeniden okunduğu için MCP süreci ile pano birbirini görür. Aynı dosyalara yeni commit (ya da farklı durum) gelince erteleme kendiliğinden kalkar.
- Onay: taslak, önerildiği commit'e sabitlidir. Onayda bağlı dosyalar o commit ile HEAD arasında değişmediyse HEAD'e yeniden sabitlenir; değiştiyse eski sabitleme kalır ve sonuç `warning: stale_after_approval` + `stale_changes` döner. `verify_at_head` ile onaylayan kişi HEAD'e kefil olur. Toplu onayda `stale_after_approval` kimlik listesi döner.
- `cortex_log_activity` dosya bildirince, o dosyaları anlatan düğümlerin eskime durumu cevaba eklenir ve AI'dan aynı turda güncellemesi ya da doğrulaması istenir (taslak olarak insana düşer). Brief'te `stale_nodes.from_your_changes`: aktörün son 14 günde kaydettiği dosyalardan eskiyenler.
- Kaydedilmemiş değişiklikler sayılmaz. Yalnızca bilgi düğümleri eskir; kalemler koda bağlanabilir ama yalnızca ters aramada görünür.
- `verifyNode` / `verifyMany` (`POST /api/verify`, `{paths}`): içeriği değiştirmeden sabitlemeyi HEAD'e taşır. AI yaparsa taslak olur.
- Panoda "Eskimiş bilgi" sayfası (`web/src/pages/Stale.tsx`): dereceye göre gruplar, satır başına Doğrula / Düzelt / Ertele, "biçimsel olanların hepsini doğrula".
