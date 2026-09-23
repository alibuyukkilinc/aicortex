---
kind: node
target: backend/staleness
proposed_by: ai-agent
reason: S7 (git önbelleği, quotepath, NFC) ve S8 (biçim tespitinin Prettier'a
  sorması) eskime davranışını değiştirdi.
base_rev: 9499b36e
id: 01M3838QVSNPF31QC5SGR4RAJK
proposed_at: 2026-09-23T21:38:08.377Z
data:
  path: backend/staleness
  title: Kod bağlantıları ve eskime tespiti
  summary: "Düğümler koda bağlanır, yazılınca ya da onaylanınca commit'e
    sabitlenir. Kod sonradan değişirse eskir: yüksek (bağlı satır, silme,
    taşıma), orta (dosyanın başka yeri), düşük (yalnızca biçim, projenin
    Prettier'ına sorulur). Yalnızca yüksek ve orta sayılır. Ertelenebilir."
  links:
    code:
      - file: src/git/git.ts
      - file: src/git/formatting.ts
      - file: src/core/staleness.ts
      - file: web/src/pages/Stale.tsx
  verified_at_commit: 0a734f0
  id: 01M34QY9MHTMEP4XJH25MGX34H
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-23T21:38:08.366Z
---

- `Git` (`src/git/git.ts`) git komutunu `-c core.quotepath=false` ile çağırır, çıktıyı NFC'ye çevirir; hata olursa "bilinmiyor" sayar. "Git deposu değil" sonucu 30 saniyede bir yeniden kontrol edilir.
- `StalenessService` bağlı yollar için `verified_at_commit..HEAD` farkına bakar; satır aralığı varsa yalnızca o satırlara dokunan değişiklikleri sayar (aralık dışı değişiklik eskitmez). Git cevapları HEAD başına önbellekte; aynı HEAD'de yeniden hesaplama git'e yeniden sormaz.
- Derece (`severity`): **yüksek** = dosya silinmiş/taşınmış ya da bağlı satır aralığına dokunulmuş; **orta** = aralıksız bağlı dosya gerçekten değişmiş, ya da sabitlenen commit artık yok (`unknown_commit`); **düşük** = yalnızca biçimsel. Düğümün derecesi değişikliklerinin en kötüsü.
- "Yalnızca biçim mi?" (`Git.formattingOnlyPairs`): 1) `git diff -w --ignore-blank-lines --quiet`; 2) boşluk, sondaki virgül ve tek arrow parametresi parantezi normalize edilince aynı mı (`sameCode`); 3) biçimleyicinin ekleyip silebileceği her karakter atılınca farklıysa kesin gerçek değişiklik; 4) projede Prettier varsa iki sürüm projenin ayarıyla biçimlenir, çıktı aynıysa biçimsel (`src/git/formatting.ts`, hesaplama başına tek alt süreç). Prettier yoksa temkinli cevap kalır. Karar içerik çiftine (blob id'leri) göre `.cortex/.index/formatting.json`'da saklanır: ilgisiz commit ya da yeniden başlatma yeniden sormaz. Ölçüm: S8 biçim süpürgesinde 22 düğümün 22'si düşük.
- `actionable(s)` = düşük değil ve ertelenmemiş. Brief, gelen kutusu, ağaçtaki "stale" durumu, `codeContext` ve menü sayacı yalnızca bunları sayar. Rapor `knowledge.stale` eyleme değerleri, `stale_info` geri kalanı gösterir.
- Erteleme: yalnızca insanlar (`POST/DELETE /api/snooze/<path>`). `.cortex/.index/snoozes.json` içinde, git'e girmez; dosya değişim zamanıyla yeniden okunduğu için MCP süreci ile pano birbirini görür. Aynı dosyalara yeni commit (ya da farklı durum) gelince erteleme kendiliğinden kalkar.
- Onay: taslak, önerildiği commit'e sabitlidir. Onayda bağlı dosyalar o commit ile HEAD arasında değişmediyse HEAD'e yeniden sabitlenir; değiştiyse eski sabitleme kalır ve sonuç `warning: stale_after_approval` + `stale_changes` döner. `verify_at_head` ile onaylayan kişi HEAD'e kefil olur.
- `cortex_log_activity` dosya bildirince, o dosyaları anlatan düğümlerin eskime durumu cevaba eklenir ve AI'dan aynı turda güncellemesi ya da doğrulaması istenir (taslak olarak insana düşer). Brief'te `stale_nodes.from_your_changes`: aktörün son 14 günde kaydettiği dosyalardan eskiyenler.
- Kaydedilmemiş değişiklikler sayılmaz. Yalnızca bilgi düğümleri eskir; kalemler koda bağlanabilir ama yalnızca ters aramada görünür. Bağlı dosya yolları NFC'ye çevrilir (macOS NFD).
- `verifyNode` / `verifyMany` (`POST /api/verify`, `{paths}`): içeriği değiştirmeden sabitlemeyi HEAD'e taşır. AI yaparsa taslak olur.
- Panoda "Eskimiş bilgi" sayfası (`web/src/pages/Stale.tsx`): dereceye göre gruplar, satır başına Doğrula / Düzelt / Ertele, "biçimsel olanların hepsini doğrula".
