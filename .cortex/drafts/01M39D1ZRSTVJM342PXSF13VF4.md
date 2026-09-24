---
kind: node
target: backend/cli
proposed_by: ai-agent
reason: findMarkdown artık .gitignore'a uyuyor ve 200'e kadar listeliyor;
  --agent-files @AGENTS.md içe aktaran CLAUDE.md'yi atlıyor (0d6da28). Gerekçe
  arsaproje kurulumunda yakalanan gizli dosya sızıntısı riski.
base_rev: 1731108f
id: 01M39D1ZRSTVJM342PXSF13VF4
proposed_at: 2026-09-24T09:48:27.289Z
data:
  path: backend/cli
  title: Komut satırı (CLI)
  summary: '`cortexboard` komutları: init, start, login, logout, mcp, bootstrap,
    reindex, semantic, report, version ve hub init | start | add-project |
    invite. `init` ilk AI için "bilgi ağacını doldur" görevini açar. Her proje
    komutu `--dir` ya da CORTEX_DIR ile başka klasörü hedefleyebilir.'
  links:
    code:
      - file: src/cli.ts
      - file: src/core/init.ts
      - file: src/core/agentFiles.ts
      - file: src/util/runtime-check.ts
  verified_at_commit: 0d6da28
  id: 01M34QY9W1VNPQMRXK141RRDFS
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-24T09:48:27.272Z
---

- Proje hangi klasörde: `--dir <klasör>`, yoksa `CORTEX_DIR`, yoksa çalışılan klasör (git gibi yukarı doğru aranır). Claude Desktop ve Codex MCP sunucularını proje klasöründe başlatmadığı için `mcp --dir` gerekir; `init --dir` projeyi o klasörde oluşturur (klasör yoksa açar). `hub` komutlarında `--dir` hub'ın veri klasörüdür (varsayılan `~/.cortex/hub`, `CORTEX_HUB`).
- `init`: .cortex/ klasörünü, token'ları (`.secrets.yaml`, 0600), `.gitattributes` (LF + aktivite günlüğü için `merge=union`), varsayılan kuralları ve üst dalları oluşturur. Dalları terminalde numaralı listeyle sorar (Enter = hepsi); `--branches a,b,c` ile sormadan seçilir. `--agent-files` var olan CLAUDE.md/AGENTS.md dosyalarına kısa bir Cortex notu ekler (bir kez); yalnızca `@AGENTS.md` ile AGENTS.md'yi içe aktaran CLAUDE.md'ye eklemez (Claude notu iki kez okurdu).
- **`--lang tr` iki şey yapar:** AI'ların yazım dilini kurala yazar ve kurulumun ağaca koyduğu metinleri (dal başlıkları, özetleri, "(henüz belgelenmedi)" eki, kök düğümün yer tutucusu, bootstrap görevinin başlığı) o dilde yazar. Metinler `src/core/init.ts` içinde dil başına bir tabloda; şu an `en` ve `tr` var, tablosu olmayan dil İngilizce alır. `--lang` verilmezse makinenin dili kurala yazılır, ama tabloyu seçen her çağrı dili açıkça geçirir.
- **Bootstrap görevi (commit c735ada):** `init` ağacı doldurma talimatını gerçek bir kayıt olarak açar: tür `task`, durum `todo`, öncelik `high`, `@ai`'a atanmış, etiket `bootstrap`, başlık "Bilgi ağacını koddan doldur (ilk kurulum)", gövde `bootstrapPrompt(..., asTask=true)` (görevi claim etmeyi, bitince "review"a almayı, büyük projede oturumlara bölüp devir notu bırakmayı da söyler).
  - Neden: talimat eskiden yalnızca `cortexboard bootstrap` ile ekrana yazılıyordu; hub'a token'la bağlanan ajan boş bir ağaç görüyor, ne yapacağını bilmiyordu. Artık yerelde de hub'da da ilk AI onu gelen kutusunda bulur, pano ilerlemeyi gösterir.
  - Kök özet hâlâ yer tutucuysa (`isPlaceholder`) brief'in `next` alanı yalnızca bu adımı gösterir; genel ipuçları kök özeti yazılınca döner. Ayrı alan yerine `next`'in yerini alması bilinçli: brief 800 token sınırında, bir test senaryosu değişiklikten önce 797'deydi.
  - `initProject(..., { bootstrapTask: false })` görevi açmaz; kalem sayan testler (`test/helpers.ts` ve hub testleri) bunu kullanır. `InitResult.bootstrapTask` görevin kimliği ya da null.
- **İçe aktarılacak belgeler (`findMarkdown`, commit 0d6da28):** git reposunda liste `git ls-files --cached --others --exclude-standard` ile gelir, yani `.gitignore`'daki dosyalar asla listelenmez; git dışında klasör taranır ve `*.local.md` atlanır; sınır 200.
  - Neden: arsaproje kurulumunda eski tarama `.gitignore`'daki `docs/ai/infra.local.md`'yi (gerçek sunucu anahtarları) listeledi; AI onu içe aktarsaydı commit'lenen `.cortex/`'e sızardı. Eski 50 sınırı da 51 belgeli klasörde DR runbook'unu düşürdü. Görev metni ayrıca gizli bilginin Cortex'e asla kopyalanmamasını söyler.
- `bootstrap`: aynı görev metnini elle vermek için yazdırır (Cortex hiç token harcamaz).
- `login`: pano için 10 dakika geçerli, imzalı bir giriş bağlantısı yazdırır (`--actor`, `--port`).
- `logout [--actor <id>] [--all]`: pano oturumlarını bitirir; çalışan sunucu oturum dosyasını yeniden okur.
- `mcp [--actor <id>]`: stdio üzerinden MCP; `--hub <url> --project <id> --token <t>` (ya da `CORTEX_HUB_URL`, `CORTEX_PROJECT`, `CORTEX_TOKEN`) ile merkezdeki projeye bağlanır.
- `version` / `--version` / `-v`: kurulu sürümü yazar.
- Hatalı kullanımda `✖ mesaj` stderr'e yazılır ve çıkış kodu 1 olur; bilinmeyen komut yardımı yazar, çıkış kodu 1. `test/cli.test.ts` gerçek alt süreçle denetler (`--dir` dahil).
- node:sqlite uyarı filtresi, node:sqlite yüklenmeden önce çalışmalı; komutların modülleri geç yüklemesinin sebebi bu.
- Her komuttan önce Node sürümüne bakılır: 22.16'dan eskiyse açık bir mesajla durur (`src/util/runtime-check.ts`).
- `hub init --org --admin-email --admin-name [--public-url]` merkezi ve ilk yöneticiyi oluşturup 48 saatlik şifre belirleme bağlantısını yazar; `hub start [--host 0.0.0.0]` ağa açılırken HTTPS yoksa uyarır; `hub add-project <klasör> [--init [--lang tr] [--branches a,b]]` (panodaki "Proje ekle" = `POST /api/admin/projects`, `branches` dizi ya da virgüllü metin); `hub invite <e-posta>`.
- Kullanıcıya dönük kurulum rehberi: `docs/INSTALL.md` (İngilizce), `docs/KURULUM.md` (Türkçe); npm paketiyle gelir.
