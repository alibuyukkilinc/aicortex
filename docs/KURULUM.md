# Cortex kurulumu

Bu rehber hiçbir şey bildiğini varsaymaz. Node.js, MCP ya da terminalle pek çalışmadıysan baştan başla ve
sırayla ilerle; biliyorsan doğrudan [Kurulum türünü seç](#kurulum-türünü-seç) bölümüne geç.

🇬🇧 English: [INSTALL.md](INSTALL.md)

- [Neler gerekiyor](#neler-gerekiyor)
- [Kurulum türünü seç](#kurulum-türünü-seç)
- [Kurulum A: kendi bilgisayarında tek proje](#kurulum-a-kendi-bilgisayarında-tek-proje) (çoğu kişi)
- [AI aracını bağla](#ai-aracını-bağla)
- [Kurulum B: ekip sunucusu (hub)](#kurulum-b-ekip-sunucusu-hub)
- [İsteğe bağlı: anlamla arama](#isteğe-bağlı-anlamla-arama)
- [Güncelleme](#güncelleme)
- [Sorun giderme](#sorun-giderme)
- [Cortex'i kaldırmak](#cortexi-kaldırmak)

---

## Neler gerekiyor

| | Neden | Nasıl kontrol edilir |
|---|---|---|
| **Node.js 22.16 veya üstü** | Cortex bir Node.js programı. Başka hiçbir şey kurulmaz: veritabanı, Docker ya da API anahtarı yok. | `node -v` → `v22.16.0` ya da üstü |
| **git** (önerilir) | Bilginin eskidiğini commit'lere bakarak anlar. git olmadan her şey çalışır, yalnızca bu özellik kapalı kalır. | `git --version` |
| **MCP konuşan bir AI kodlama aracı** | Claude Code, Cursor, Copilot'lu VS Code, Claude Desktop, Codex… AI, Cortex'i MCP ile okur ve yazar. | ([AI aracını bağla](#ai-aracını-bağla)) |

**Node.js kurmak:** [nodejs.org](https://nodejs.org) adresinden **LTS** sürümünü indirip kur (Windows,
macOS) ya da Linux'ta paket yöneticini kullan. Sonra **yeni** bir terminal açıp `node -v` ile kontrol et.
Yanında `npm` ve `npx` gelir; Cortex'in ihtiyacı olan bu kadar.

> **Terminal**: Windows'ta "Komut İstemi" ya da "PowerShell", macOS'ta "Terminal". Aşağıdaki her komut
> orada, projenin klasöründe yazılır (`cd projenin/yolu`).

---

## Kurulum türünü seç

| | **A. Kendi bilgisayarında tek proje** | **B. Ekip sunucusu (hub)** |
|---|---|---|
| Kimin için | Tek kişi (ve AI'ları), bir ya da birkaç repo | Ekip: birden çok kişi, birden çok proje, AI ajanları |
| Başlangıç | `npx cortexboard init`, sonra `npx cortexboard start` | `npx cortexboard hub init`, sonra `npx cortexboard hub start` |
| Kim erişir | Yalnızca bu bilgisayar (localhost) | Davet ettiğin herkes, HTTPS üzerinden |
| Giriş | Terminalin yazdığı tek kullanımlık bağlantı, şifre yok | E-posta + şifre (davet bağlantısı), AI ajanları token ile |
| Roller | Sen (insan) ve AI'ın | Sahip, Yönetici, Üye, İzleyici; AI Okuyucu, Katkıcı, Güvenilir; proje başına |
| Bilgi nerede durur | Repoda: `.cortex/`, kodla birlikte commit'lenir | Yine her reponun `.cortex/` klasöründe; hub yalnızca kişileri ve üyelikleri tutar |
| AI bağlantısı | Proje klasöründe başlatılan MCP | Ajan token'ıyla hub'a MCP, uzaktaki AI'lar için HTTP üzerinden MCP |

**A ile başla.** Bir projeyi sonradan hiçbir şeyini değiştirmeden hub'a taşıyabilirsin: hub yalnızca
klasörü kaydeder.

**Komutları çalıştırmanın üç yolu.** Örneklerin hepsi `npx cortexboard …` kullanır: paketi ilk seferde
indirir, kurulum gerektirmez. İstersen:

| | Komut | Ne zaman |
|---|---|---|
| `npx` (varsayılan) | `npx cortexboard start` | Hiçbir şey kurulmaz; istediğin sürüm çalışır |
| Genel kurulum | `npm install -g cortexboard`, sonra `cortexboard start` | Birçok projede her gün kullanıyorsan |
| Proje bağımlılığı | `npm install -D cortexboard`, sonra `npx cortexboard start` | Ekibin tamamı `package.json`'dan aynı sürümü alsın |

---

## Kurulum A: kendi bilgisayarında tek proje

### 1. `.cortex/` klasörünü oluştur

Proje klasöründe:

```bash
npx cortexboard init
```

Projenin hangi üst bilgi dallarına ihtiyacı olduğunu sorar (backend, frontend, mobil…); hepsi için Enter'a
bas ya da numaralarla ve kendi adlarınla cevap ver. Soruyu atlamak için:

```bash
npx cortexboard init --branches backend,frontend,odeme --lang tr
```

`--lang`, AI'ların bilgiyi hangi dilde yazacağıdır (`tr`, `en`, …; verilmezse bilgisayarının dili).
İki **token** yazdırır (biri senin, biri AI'ın). Nadiren gerekir; hiç commit'lenmeyen
`.cortex/.secrets.yaml` dosyasında saklanır.

Oluşturduğu yapı:

```
.cortex/
├── cortex.config.yaml   kişiler ve AI'lar, onay politikası, saat dilimi   → commit'le
├── rules/               her AI'ın uyduğu kurallar (yalnızca insan)        → commit'le
├── tree/                bilgi, her sayfa bir Markdown dosyası             → commit'le
├── items/               görevler, sorunlar, sorular, kararlar, ekleri     → commit'le
├── activity/            hangi AI ne yaptı ve neden                         → commit'le
├── drafts/              onayını bekleyen AI değişiklikleri                → commit'le
├── .secrets.yaml        token'lar                                          → asla (git'e girmez)
├── .sessions.json       pano girişleri                                     → asla (git'e girmez)
└── .index/              arama önbelleği, dosyalardan yeniden kurulur       → asla (git'e girmez)
```

Diğer kodlar gibi commit'le: `git add .cortex && git commit -m "Cortex eklendi"`. İçindeki her şey düz
metindir; her düzenleyicide okunur, pull request'lerde incelenir.

### 2. Panoyu aç

```bash
npx cortexboard start
```

Adresi (`http://localhost:4747`) ve bir **giriş bağlantısı** yazdırır. Bağlantıyı tarayıcıda aç: şifre
yok, doğrudan içeridesin. Bağlantı 10 dakika geçerli; `npx cortexboard login` yenisini yazar. Panoyu
kullandığın sürece terminal açık kalsın (Ctrl+C durdurur).

4747 portu dolu mu? `npx cortexboard start --port 4800`.

### 3. AI'ını bağla ve ağacı doldur

`init` ilk iş olarak AI için bir görev açar: **"Bilgi ağacını koddan doldur (ilk kurulum)"**. Görev `@ai`'a
atanır ve panoda görünür. [AI aracını bağla](#ai-aracını-bağla) (sonraki bölüm), sonra AI'ına yalnızca
"Cortex'teki görevine başla" de. Görevi gelen kutusunda bulur, brief de ağaç doldurulana kadar ona önce bunu
yapmasını söyler. AI kod tabanını okur ve bilgi ağacını yazar. Aynı metni elle vermek istersen
`npx cortexboard bootstrap` yazdırır.

Yazdığı her sayfa
**taslak** olarak gelir; panoda **Onaylar** altından onayla (topluca da onaylanabilir). Bundan sonra AI her
oturuma projeyi baştan okumak yerine kısa bir özetle başlar, emin olmadığında sana **Bildirimler**'den
sorar.

---

## AI aracını bağla

Cortex, AI aracının kendisinin başlattığı bir **MCP sunucusu** olarak çalışır. Komut hep aynıdır:

```
npx cortexboard mcp --actor ai-agent
```

**proje klasöründe** başlatılır (araç onu başka bir yerde başlatıyorsa `--dir <proje klasörü>` ile).
Aracını seç:

**Claude Code** (proje klasöründe):

```bash
claude mcp add cortex -- npx cortexboard mcp --actor ai-agent
```

**Cursor** (projede `.cursor/mcp.json`) ve **`.mcp.json` okuyan her araç**:

```json
{
  "mcpServers": {
    "cortex": { "command": "npx", "args": ["cortexboard", "mcp", "--actor", "ai-agent"] }
  }
}
```

**Copilot'lu VS Code** (`.vscode/mcp.json`):

```json
{
  "servers": {
    "cortex": { "type": "stdio", "command": "npx", "args": ["cortexboard", "mcp", "--actor", "ai-agent"] }
  }
}
```

**Claude Desktop** (Ayarlar → Geliştirici → Yapılandırmayı düzenle). Sunucuları projende başlatmaz, bu
yüzden proje klasörünü yaz:

```json
{
  "mcpServers": {
    "cortex": { "command": "npx", "args": ["cortexboard", "mcp", "--actor", "ai-agent", "--dir", "C:/kod/magaza"] }
  }
}
```

**Codex CLI** (`~/.codex/config.toml`):

```toml
[mcp_servers.cortex]
command = "npx"
args = ["cortexboard", "mcp", "--actor", "ai-agent", "--dir", "/home/ben/kod/magaza"]
```

> **Windows ve `npx`:** bir araç `npx`'i bulamadığını söylerse `"command": "cmd"` yaz ve `args`'ın başına
> `"/c", "npx"` ekle.

AI'ın Cortex'i iyi kullanması için `npx cortexboard init --agent-files`, var olan `CLAUDE.md` / `AGENTS.md`
dosyasına kısa bir Cortex bölümü ekler. Çalıştığını denemek için AI'ına *"cortex_brief'i çağır"* de; proje
özetiyle ve dallarla cevap vermeli.

**Birden fazla AI mı var?** `.cortex/cortex.config.yaml` dosyasına aktör ekle (ör.
`{ id: cursor, kind: ai }`) ve her birini kendi `--actor`'ıyla başlat; aktivite akışı kimin ne yaptığını
gösterir.

---

## Kurulum B: ekip sunucusu (hub)

Tek sunucu, çok proje, şifreli kişiler, token'lı AI ajanları. Her proje bilgisini yine kendi reposunda
tutar; hub o klasörleri okur.

### 1. Hub'ı oluştur (sunucuda)

```bash
npx cortexboard hub init --org "Acme" --admin-email sen@acme.com --admin-name "Adın" --public-url https://cortex.acme.com
```

Verisini `~/.cortex/hub` altında tutar (`--dir` ya da `CORTEX_HUB` ile değişir): kişiler, şifre özetleri,
oturumlar, ajanlar ve üyelikler. **Bu klasörü yedekle, asla commit'leme.** Şifreni belirlemen için bir
bağlantı yazdırır (48 saat geçerli).

### 2. Projeleri kaydet

Sunucuda her reponun bir kopyası olmalı. Sonra:

```bash
npx cortexboard hub add-project /srv/repos/magaza                                            # .cortex/ zaten var
npx cortexboard hub add-project /srv/repos/blog --init --lang tr --branches backend,frontend  # önce .cortex/ oluşturur
```

ya da panoda: **Organizasyon → Projeler → Proje ekle**.

Cortex'i hiç kullanmamış bir proje (`--init`) boş bir iskeletle başlar: seçtiğin dallar ve AI için açılmış
**"Bilgi ağacını koddan doldur"** görevi. Projeye eklediğin ilk AI ajanı ([5. adım](#5-ai-ajanlarını-huba-bağla))
bu görevi gelen kutusunda bulur; kimsenin sunucuda komut çalıştırıp metin kopyalaması gerekmez. Ajanın rolü
**Katkıcı** olursa yazdıkları taslak düşer; ekip ağacı panodaki **Onaylar** sayfasından (topluca) onaylar.
Büyük bir projede AI görevi birkaç oturuma bölebilir: görevi bırakırken nerede kaldığını not eder.

### 3. HTTPS arkasında çalıştır

Hub kişileri şifreyle içeri aldığı için **HTTPS** ile erişilmeli. Sunucunun kendi loopback adresinde
çalıştır ve önüne bir ters vekil koy. [Caddy](https://caddyserver.com) ile (sertifikalar kendiliğinden):

```
# /etc/caddy/Caddyfile
cortex.acme.com {
  reverse_proxy 127.0.0.1:4747
}
```

ve hub'a o vekilin arkasında olduğunu `~/.cortex/hub/hub.yaml` dosyasında söyle:

```yaml
public_url: https://cortex.acme.com
trust_proxy: true                 # https'i ve istemci adresini vekilden al
allowed_hosts: [cortex.acme.com]  # yalnızca bu ada cevap ver
```

Başlat (systemd, pm2 ya da platformunun servis yöneticisiyle açık tut):

```bash
npx cortexboard hub start            # 127.0.0.1:4747'de dinler
```

<details>
<summary>systemd örneği</summary>

```ini
# /etc/systemd/system/cortex-hub.service
[Unit]
Description=Cortex hub
After=network.target

[Service]
User=cortex
ExecStart=/usr/bin/npx --yes cortexboard@0.2.2 hub start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

`sudo systemctl enable --now cortex-hub`
</details>

Güvendiğin bir yerel ağda HTTPS olmadan doğrudan ağa açmak (`hub start --host 0.0.0.0`) mümkün; ama
oturum çerezleri o zaman Secure işaretlenir ve düz http ile giriş tutunmaz. `hub.yaml`'da
`cookie_secure: false` yalnızca şifrelerin şifresiz gideceğini bilerek yazılmalı.

### 4. Kişileri davet et, AI ajanlarını ekle

Panoda, **Organizasyon**:
- **Kişiler → Kişi ekle**: e-posta, ad, ilk proje ve rol. Kişiye göndereceğin tek kullanımlık bir bağlantı
  (48 saat) alırsın; şifresini kendisi belirler. Aynı düğme sonradan şifre sıfırlama işi görür.
- **AI ajanları → AI ajanı ekle**: bir kimlik (ör. `claude-code`), ilk proje ve rol. **Token yalnızca bir
  kez gösterilir**; kopyala.
- Her projede **Üyeler** sayfası rolü ve her üyenin **ne göreceğini** belirler: her şeyi, yalnızca kendi
  kayıtlarını, isteğe bağlı yalnızca bazı dalları (ör. yalnızca `mobil`).

| Rol | Kimin için | Ne yapabilir |
|---|---|---|
| Sahip, Yönetici | kişiler | her şey, üyeler ve kurallar dahil |
| Üye | kişiler | kayıtlar ve bilgi üzerinde çalışır, AI taslaklarını onaylar |
| İzleyici | kişiler | okur, soru sorar ve cevaplar |
| Okuyucu | AI | okur |
| Katkıcı | AI | kayıtlar üzerinde çalışır; bilgi yazımları onay bekler |
| Güvenilir | AI | Katkıcı gibi, bilgi yazımları doğrudan geçer |

### 5. AI ajanlarını hub'a bağla

Bir geliştiricinin bilgisayarında (araç kendisi başlatır; proje klasörü gerekmez):

```bash
claude mcp add cortex -- npx cortexboard mcp --hub https://cortex.acme.com --project magaza --token <ajan token'ı>
```

ya da `CORTEX_HUB_URL`, `CORTEX_PROJECT`, `CORTEX_TOKEN` ortam değişkenleriyle. Senin makinelerinde
çalışmayan bir AI (ChatGPT, sunucuda çalışan bir ajan) `https://cortex.acme.com/mcp/p/magaza` adresine
`Authorization: Bearer <ajan token'ı>` ile **HTTP üzerinden MCP** bağlanır. Hangi yolla gelirse gelsin
ajanın rolü ve görünürlüğü geçerlidir.

---

## İsteğe bağlı: anlamla arama

Kelime araması hazır gelir ve Türkçe harfleri anlar. Bir şeyi **anlamıyla** da (diller arası) bulmak için
bilgisayar başına bir kez:

```bash
npx cortexboard semantic on
```

Yerel bir model indirir (~420 MB, bir kez, `~/.cortex` altında, bütün projeler ortak kullanır). Hiçbir şey
bilgisayarından çıkmaz. `semantic status` durumu gösterir, `semantic off` kapatır.

---

## Güncelleme

```bash
npx cortexboard@latest start      # npx: yeni sürümü istemen yeterli
npm install -g cortexboard@latest # genel kurulum
```

`.cortex/` klasörün düz dosyalardır ve her sürüm onları okur; arama önbelleği biçimi değişince kendini
yeniden kurar. Nelerin değiştiği [CHANGELOG.md](../CHANGELOG.md)'de. 0.1'den 0.2'ye elle bir şey gerekmez:
açık pano oturumun kapanmadan yeni girişe taşınır, `.cortex/.gitattributes` dosyasına bir kez bir satır
eklenir (commit'le).

---

## Sorun giderme

| Gördüğün | Yapılacak |
|---|---|
| `Cortex needs Node.js 22.16 or newer` | nodejs.org'dan güncel LTS'yi kur, yeni terminal aç. |
| `No .cortex folder found` | Komutu proje klasöründe çalıştır ya da `--dir <proje klasörü>` ver. |
| `address already in use` / port dolu | `npx cortexboard start --port 4800` |
| Giriş bağlantısı süresi dolmuş diyor | `npx cortexboard login` yenisini yazar (10 dakika). |
| Pano açılıyor ama "panoyu terminalden açın" diyor | Oturumun bitmiş; yeni bir giriş bağlantısı kullan. |
| AI aracında `cortex_*` araçları görünmüyor | Sunucuyu ekledikten sonra aracı yeniden başlat; komutun proje klasöründe elle çalıştığını kontrol et. Windows'ta `cmd /c npx` biçimini dene. |
| "Eskimiş bilgi" hiç çıkmıyor | Proje bir git deposu değil ya da değişiklik henüz commit'lenmedi (yalnızca commit'ler sayılır). |
| Hub'a düz http ile giriş tutunmuyor | Beklenen davranış: HTTPS kullan ([Kurulum B](#3-https-arkasında-çalıştır)). |
| Başka bir şey | `npx cortexboard --version`, sonra ne çalıştırdığını ve ne gördüğünü yazarak bir issue aç. |

---

## Cortex'i kaldırmak

- MCP kaydını AI aracından kaldır (`claude mcp remove cortex` ya da JSON'dan sil).
- Genel kurduysan `npm uninstall -g cortexboard`.
- `.cortex/` **projenin bilgisidir**; gerçekten gitmesini istiyorsan sil (git geçmişinde kalır).
  `~/.cortex/` isteğe bağlı arama modelini ve sunucudaysa hub'ın verisini tutar.
