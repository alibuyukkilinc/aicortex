---
kind: node
target: backend/staleness
proposed_by: ai-agent
reason: 512d9a9'da web/src/pages/Stale.tsx'te yalnızca satır içi yazı boyutu
  değişti; eskime dereceleri ve işlemler aynı.
base_rev: b27df239
id: 01M39Y2AW37AY6BR75FPM5JYMZ
proposed_at: 2026-09-24T14:45:44.451Z
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
  verified_at_commit: 512d9a9f75b469a94fc6f763f240b5c883222960
  id: 01M34QY9MHTMEP4XJH25MGX34H
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-24T14:45:44.441Z
---

- `Git` (`src/git/git.ts`) git komutunu `-c core.quotepath=false` ile çağırır, çıktıyı NFC'ye çevirir; hata olursa "bilinmiyor" sayar.
- `StalenessService` bağlı yollar için `verified_at_commit..HEAD` farkına bakar; satır aralığı varsa yalnızca o satırlara dokunan değişiklikleri sayar. Git cevapları HEAD başına önbellekte.
- `refresh(force, checkHead)`: normalde 3 sn kısıtlanır; `checkHead` kısıtlamayı atlar ve yalnızca HEAD değiştiyse yeniden hesaplar. `cortex_log_activity` dosya bildirince bunu kullanır: AI commit'ten saniyeler sonra kaydettiği için aksi halde eski HEAD'i görüp "değişikliğin şunları eskitti" demiyordu (protokol testi buldu).
- Derece (`severity`): **yüksek** = dosya silinmiş/taşınmış ya da bağlı satır aralığına dokunulmuş; **orta** = aralıksız bağlı dosya gerçekten değişmiş, ya da sabitlenen commit artık yok; **düşük** = yalnızca biçimsel.
- "Yalnızca biçim mi?" (`Git.formattingOnlyPairs`): 1) `git diff -w --ignore-blank-lines --quiet`; 2) normalize edilince aynı mı (`sameCode`); 3) biçimleyicinin ekleyip silebileceği karakterler atılınca farklıysa kesin gerçek değişiklik; 4) projede Prettier varsa iki sürüm projenin ayarıyla biçimlenir (`src/git/formatting.ts`, tek alt süreç). Karar blob çiftine göre `.cortex/.index/formatting.json`'da saklanır.
- `actionable(s)` = düşük değil ve ertelenmemiş. Brief, gelen kutusu, ağaç, `codeContext` ve menü sayacı yalnızca bunları sayar.
- Erteleme: yalnızca insanlar (`POST/DELETE /api/snooze/<path>`), `.cortex/.index/snoozes.json`, git'e girmez; aynı dosyalara yeni commit gelince kendiliğinden kalkar.
- Onay: taslak önerildiği commit'e sabitlidir; bağlı dosyalar o arada değişmediyse onayda HEAD'e sabitlenir, değiştiyse eski sabitleme kalır ve `stale_after_approval` döner (`backend/approval`).
- `cortex_log_activity` cevabı eskiyen düğümleri listeler; brief'te `stale_nodes.from_your_changes`.
- Kaydedilmemiş değişiklikler sayılmaz. Bağlı dosya yolları NFC.
- `verifyNode` / `verifyMany` (`POST /api/verify`): içeriği değiştirmeden sabitlemeyi HEAD'e taşır. AI yaparsa taslak olur.
- Panoda "Eskimiş bilgi" sayfası (`web/src/pages/Stale.tsx`).
