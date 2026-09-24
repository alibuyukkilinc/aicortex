---
title: Komut satırı (CLI)
summary: "`cortexboard` komutları: init, start, login, logout, mcp, bootstrap,
  reindex, semantic, report, version ve ekip sunucusu için hub init | start |
  add-project | invite. Her proje komutu `--dir` ya da CORTEX_DIR ile başka bir
  klasörü hedefleyebilir."
links:
  code:
    - file: src/cli.ts
    - file: src/core/init.ts
    - file: src/core/agentFiles.ts
    - file: src/util/runtime-check.ts
verified_at_commit: 7bf1c4478535011c15b888c81a2092e4e2225766
id: 01M34QY9W1VNPQMRXK141RRDFS
status: active
updated_by: ai-agent
updated_at: 2026-09-24T08:08:02.771Z
---

- Proje hangi klasörde: `--dir <klasör>`, yoksa `CORTEX_DIR`, yoksa çalışılan klasör (git gibi yukarı doğru aranır). Claude Desktop ve Codex MCP sunucularını proje klasöründe başlatmadığı için `mcp --dir` gerekir; `init --dir` projeyi o klasörde oluşturur (klasör yoksa açar). `hub` komutlarında `--dir` hub'ın veri klasörüdür (varsayılan `~/.cortex/hub`, `CORTEX_HUB`).
- `init`: .cortex/ klasörünü, token'ları (`.secrets.yaml`, 0600), `.gitattributes` (LF + aktivite günlüğü için `merge=union`), varsayılan kuralları ve üst dalları oluşturur. Dalları terminalde numaralı listeyle sorar (Enter = hepsi); `--branches a,b,c` ile sormadan seçilir. `--agent-files` var olan CLAUDE.md/AGENTS.md dosyalarına kısa bir Cortex notu ekler (bir kez).
- **`--lang tr` iki şey yapar:** AI'ların yazım dilini kurala yazar ve kurulumun ağaca koyduğu metinleri (dal başlıkları, özetleri, "(henüz belgelenmedi)" eki, kök düğümün yer tutucusu) o dilde yazar. Metinler `src/core/init.ts` içinde dil başına bir tabloda; şu an `en` ve `tr` var, tablosu olmayan dil İngilizce alır. `--lang` verilmezse makinenin dili kurala yazılır, ama tabloyu seçen her çağrı dili açıkça geçirir.
- `bootstrap`: ağacı doldurması için AI'a verilecek görevi yazdırır (Cortex hiç token harcamaz).
- `login`: pano için 10 dakika geçerli, imzalı bir giriş bağlantısı yazdırır (`--actor`, `--port`).
- `logout [--actor <id>] [--all]`: pano oturumlarını bitirir; çalışan sunucu oturum dosyasını yeniden okur.
- `mcp [--actor <id>]`: stdio üzerinden MCP; `--hub <url> --project <id> --token <t>` (ya da `CORTEX_HUB_URL`, `CORTEX_PROJECT`, `CORTEX_TOKEN`) ile merkezdeki projeye bağlanır.
- `version` / `--version` / `-v`: kurulu sürümü yazar.
- Hatalı kullanımda `✖ mesaj` stderr'e yazılır ve çıkış kodu 1 olur; bilinmeyen komut yardımı yazar, çıkış kodu 1. `test/cli.test.ts` gerçek alt süreçle denetler (`--dir` dahil).
- node:sqlite uyarı filtresi, node:sqlite yüklenmeden önce çalışmalı; komutların modülleri geç yüklemesinin sebebi bu.
- Her komuttan önce Node sürümüne bakılır: 22.16'dan eskiyse açık bir mesajla durur (`src/util/runtime-check.ts`).
- `hub init --org --admin-email --admin-name [--public-url]` merkezi ve ilk yöneticiyi oluşturup 48 saatlik şifre belirleme bağlantısını yazar; `hub start [--host 0.0.0.0]` ağa açılırken HTTPS yoksa uyarır; `hub add-project <klasör> [--init]`; `hub invite <e-posta>`.
- Kullanıcıya dönük kurulum rehberi: `docs/INSTALL.md` (İngilizce), `docs/KURULUM.md` (Türkçe); npm paketiyle gelir.
