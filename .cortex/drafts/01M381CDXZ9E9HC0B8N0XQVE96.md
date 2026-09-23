---
kind: node
target: backend/cli
proposed_by: ai-agent
reason: S4 `logout` komutunu ekledi ve init gizli dosyayı 0600 yazıyor.
base_rev: 4913518f
id: 01M381CDXZ9E9HC0B8N0XQVE96
proposed_at: 2026-09-23T21:05:12.127Z
data:
  path: backend/cli
  title: Komut satırı (CLI)
  summary: "`aicortex` (kısa adı `cortex`) komutları: init, start, login, logout,
    mcp, bootstrap, reindex, semantic, report ve ekip sunucusu için hub init |
    start | add-project | invite. Ağır modüller yalnızca o komut çalışınca
    yüklenir."
  links:
    code:
      - file: src/cli.ts
      - file: src/core/init.ts
      - file: src/core/agentFiles.ts
      - file: src/util/runtime-check.ts
  verified_at_commit: 939f5db
  id: 01M34QY9W1VNPQMRXK141RRDFS
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-23T21:05:12.122Z
---

- `init`: .cortex/ klasörünü, token'ları (`.secrets.yaml`, 0600), varsayılan kuralları ve üst dalları oluşturur. Hangi dalların açılacağını terminalde numaralı listeyle sorar (Enter = hepsi); `--branches backend,frontend,odeme` ile sormadan seçilir, şablonda olmayan adlar da kabul edilir (`resolveBranches`). `--lang tr` AI'ların yazım dilini belirler (verilmezse bilgisayarın dili). Rapor saat dilimi bilgisayardan alınıp `cortex.config.yaml`'a yazılır. `--agent-files` var olan CLAUDE.md/AGENTS.md dosyalarına kısa bir Cortex notu ekler.
- `bootstrap`: ağacı doldurması için senin AI'ına verilecek görevi yazdırır (Cortex hiç token harcamaz); yazım dilini de söyler.
- `login`: pano için 10 dakika geçerli, imzalı bir giriş bağlantısı yazdırır.
- `logout [--actor <id>] [--all]`: o kişinin (varsayılan: ilk insan aktör) bütün pano oturumlarını bitirir; `--all` herkesinkini. Çalışan sunucu oturum dosyasını yeniden okuduğu için yeniden başlatma gerekmez.
- node:sqlite uyarı filtresi, node:sqlite yüklenmeden önce çalışmalı; komutların modülleri geç yüklemesinin sebebi bu.
- Her komuttan önce Node sürümüne bakılır: 22.16'dan eskiyse "Cortex needs Node.js 22.16 or newer" mesajıyla durur (`src/util/runtime-check.ts`).
- `hub init --org --admin-email --admin-name [--public-url]` merkezi ve ilk organizasyon yöneticisini oluşturup şifre belirleme bağlantısını yazar; `hub start [--host 0.0.0.0]` ağa açılırken HTTPS yoksa uyarır; `hub add-project <klasör> [--init]`; `hub invite <e-posta>` yeni bağlantı (şifre sıfırlama).
