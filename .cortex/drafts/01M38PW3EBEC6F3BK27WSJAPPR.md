---
kind: node
target: backend/cli
proposed_by: ai-agent
reason: "Gözden geçirme: `version` komutu (S11), 48 saatlik davet metni ve hub
  start uyarısı (S5), .gitattributes merge kuralı (S9) ve hata davranışı
  eklendi."
base_rev: 6a817065
id: 01M38PW3EBEC6F3BK27WSJAPPR
proposed_at: 2026-09-24T03:20:45.771Z
data:
  path: backend/cli
  title: Komut satırı (CLI)
  summary: "`aicortex` (kısa adı `cortex`) komutları: init, start, login, logout,
    mcp, bootstrap, reindex, semantic, report, version ve ekip sunucusu için hub
    init | start | add-project | invite. Ağır modüller yalnızca o komut
    çalışınca yüklenir."
  links:
    code:
      - file: src/cli.ts
      - file: src/core/init.ts
      - file: src/core/agentFiles.ts
      - file: src/util/runtime-check.ts
  verified_at_commit: 3295916c724365d800427f9468950a5ad1f02895
  id: 01M34QY9W1VNPQMRXK141RRDFS
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-24T03:20:45.760Z
---

- `init`: .cortex/ klasörünü, token'ları (`.secrets.yaml`, 0600), `.gitattributes` (LF + aktivite günlüğü için `merge=union`), varsayılan kuralları ve üst dalları oluşturur. Hangi dalların açılacağını terminalde numaralı listeyle sorar (Enter = hepsi); `--branches backend,frontend,odeme` ile sormadan seçilir. `--lang tr` AI'ların yazım dilini belirler. Rapor saat dilimi bilgisayardan alınır. `--agent-files` var olan CLAUDE.md/AGENTS.md dosyalarına kısa bir Cortex notu ekler (bir kez).
- `bootstrap`: ağacı doldurması için senin AI'ına verilecek görevi yazdırır (Cortex hiç token harcamaz).
- `login`: pano için 10 dakika geçerli, imzalı bir giriş bağlantısı yazdırır (`--actor`, `--port`).
- `logout [--actor <id>] [--all]`: o kişinin (varsayılan: ilk insan aktör) bütün pano oturumlarını bitirir; `--all` herkesinkini. Çalışan sunucu oturum dosyasını yeniden okur.
- `version` / `--version` / `-v`: kurulu sürümü yazar (package.json'dan).
- Hatalı kullanımda `✖ mesaj` stderr'e yazılır ve çıkış kodu 1 olur; bilinmeyen komut yardımı yazar, çıkış kodu 1. Bunları `test/cli.test.ts` gerçek alt süreçle denetler.
- node:sqlite uyarı filtresi, node:sqlite yüklenmeden önce çalışmalı; komutların modülleri geç yüklemesinin sebebi bu.
- Her komuttan önce Node sürümüne bakılır: 22.16'dan eskiyse açık bir mesajla durur (`src/util/runtime-check.ts`).
- `hub init --org --admin-email --admin-name [--public-url]` merkezi ve ilk yöneticiyi oluşturup 48 saatlik şifre belirleme bağlantısını yazar; `hub start [--host 0.0.0.0]` ağa açılırken HTTPS yoksa uyarır ve çerezin Secure olduğunu söyler; `hub add-project <klasör> [--init]`; `hub invite <e-posta>` yeni bağlantı (şifre sıfırlama).
