---
title: Ekip sunucusu (hub)
summary: "Tek sunucu, çok proje: kişiler e-posta + şifreyle, AI ajanları token
  ile girer; proje başına rol ve görünürlük. Bağlı projeler salt okunur okunur;
  hub proje kopyalarını yalnızca pull ile günceller, commit/push yapmaz. Merkez
  verisi ~/.cortex/hub'da SQLite."
links:
  code:
    - file: src/hub/store.ts
    - file: src/hub/server.ts
    - file: src/hub/roles.ts
    - file: src/hub/access.ts
    - file: src/hub/crypto.ts
    - file: src/hub/limiter.ts
    - file: src/hub/gitSync.ts
verified_at_commit: d20d9ac72b3db6993a2b4a92d19d2cc89b23604c
id: 01M34ZBMQDA04RDK228RSTYEHP
status: active
updated_by: ai-agent
updated_at: 2026-09-25T19:27:43.793Z
---

## Parçalar (`src/hub`)
- `store.ts`: SQLite (`hub.db`) + `hub.yaml` ayarları (`org`, `public_url`, `host`, `port`, `allowed_hosts`, `cookie_secure`, `trust_proxy`). Tablolar: users (scrypt şifre özeti), sessions, invites, agents (token özeti), projects (klasör yolu), members (proje, kişi/ajan, rol, scope, branches), usage. Kimlikler (`ali`, `claude-code`) kişi ve ajanlar arasında benzersiz, çünkü projelerin dosyalarında aktör adı olarak görünürler.
- `crypto.ts`: scrypt (N=16384), tokenlar rastgele 32 bayt ve yalnızca SHA-256 özeti saklanır; bulunmayan hesapta da aynı süre harcanır. Tek proje modunun pano oturumları da bu ilkelleri kullanır.
- `roles.ts`: insan rolleri owner/admin/member/viewer, AI rolleri reader/contributor/trusted; her rolün yetki listesi ve `trusted` için `{ node: "auto" }` onay istisnası (`Actor.policy`).
- `access.ts`: üyelikten `Access` nesnesi: `can(perm)`, `seesNode`, `seesItem`, `seesActivity`, `restricted` ve `itemSql()` (seesItem'in aynısı, items tablosu üzerinde SQL parçası; listeler bunu LIMIT/OFFSET'ten önce uygular, sayfalar dolu ve toplam doğru gelir).
- `limiter.ts`: tüm kapılar için ortak deneme sınırlayıcısı (süresi dolanlar zamanlayıcıyla silinir, anahtar sayısı üst sınırlı).
- `server.ts`: `Hub` her projeyi ilk kullanımda açar (`Cortex` + watch) ve üyeleri bellekte aktör listesine ekler (`syncActors`, dosyaya yazmaz). `buildHubServer`: giriş, davet, organizasyon yönetimi (/api/admin/*), proje API'si (/api/p/:project/*, ortak `projectRoutes`) ve üyeler.

## Kurallar
- Organizasyon yöneticileri her projede Sahip sayılır; son sahip çıkarılamaz; sahipliği yalnızca sahipler değiştirir; kendini devre dışı bırakamazsın, son organizasyon yöneticisi kaldırılamaz.
- AI hiçbir rolde onaylayamaz, kural değiştiremez, üye yönetemez (rol listesinde yok, çekirdek de insan ister).
- Görünürlük: scope `own` = yazdığı veya kendisine/grubuna (@humans, @ai) atanan kayıtlar; `branches` = yalnızca o dallar (atası olan dallar gezinmek için görünür). Gizli olan 404 döner.
- Deneme sınırları (15 dakikalık pencere): adres+e-posta başına 10 hatalı şifre; adres başına 10 hatalı ajan token'ı (REST ve `/mcp/p/:project` birlikte); adres başına 20 geçersiz davet bağlantısı. Aşılınca 429.
- **Üyeliği olmayan istek:** 403 ve mesaj iki tarafı da yazar — `opencode is not a member of "arsa-back"`. Geçersiz token `unauthorized`, geçerli token + eksik üyelik `forbidden`; ikisi karışmasın diye ayrı.
- **Dışarıdan verilen üyelik anında geçerli:** erişimi `members` satırı belirler (her istekte okunur), projenin bellekteki aktör listesi de tanımadığı bir üye gelince tazelenir (`syncActors`, proje kapsamının `preHandler`'ında). Yani `cortexboard hub member` ile verilen erişim için hub'ı yeniden başlatmak gerekmez.
- **Organizasyon kavramı yok, tek düz hub:** `User.org_admin` sadece bir bayrak; true ise o kişi her projede otomatik Sahip sayılır. Birden fazla, birbirinden habersiz taraf hub'a girerse bu ayrı bir tur olarak ele alınmalı (bkz. karar `01M35AS75BZVM32EFWX3HBCW4H`: mobil ekip mevcut proje+üyelik modeliyle ayrı proje olarak katılabiliyor).
- **`GET /api/p/:project/members/candidates`**: org_admin için tüm hub roster'ı; org_admin olmayan proje sahibi/yöneticisi için yalnızca başka bir projede de owner/admin olduğu kişi/ajanlarla sınırlı. E-posta ile davet bu listeden bağımsız.
- Bilinen sınır: hub açtığı her projeyi yeniden başlayana kadar bellekte tutar (CHANGELOG'da yazılı).

## AI ajanları nasıl bağlanır
`cortexboard mcp --hub <url> --project <id> --token <t>`: MCP araçları merkezdeki proje API'sini kullanır (`remoteApi`), ajanın rolü ve görünürlüğü aynen geçerlidir. Bu bilgisayarda çalışmayan AI'lar (ör. ChatGPT) için MCP'nin HTTP ucu: `POST <url>/mcp/p/<proje>`, `Authorization: Bearer <ajan tokenı>`, durumsuz (GET ve DELETE 405). İstek aynı proje rotalarına yeniden yollanır; token, rol ve görünürlük REST ile birebir aynıdır.
**Ajanın çalıştığı istemcinin kendi yapılandırması ayrı bir konudur:** ajan bağlanamıyorsa sırayla bak — istemci hangi dosyayı okuyor (OpenCode `opencode.json(c)` içinde düz `mcp` haritası; `.mcp.json` Claude Code'undur), adres çözülüyor mu, token isteğe gidiyor mu, ajan o projeye üye mi.

## Ekranlar (kim neyi nereden yapar)
- **Kişi ekleme:** Organizasyon → Kişiler → "Kişi ekle". Sistem 48 saatlik tek kullanımlık davet bağlantısı verir; "Yeni bağlantı" aynı zamanda şifre sıfırlamadır.
- **AI ajanı ekleme:** Organizasyon → AI ajanları → "AI ajanı ekle". Token bir kez gösterilir; "Yeni token" eskisini geçersiz kılar. Bu düğme *yeni* ajan oluşturur; var olan bir ajanı bir projeye eklemek için proje panosundaki Üyeler sayfasının açılır listesi ya da `cortexboard hub member` kullanılır.
- **Proje ekleme:** Organizasyon → Projeler → "Proje ekle" ya da `cortexboard hub add-project <klasör>`.
- **Üyelik ve görünürlük:** Proje panosunda Üyeler sayfası: rol, "her şeyi / yalnızca kendi kayıtlarını", dal kısıtı. Terminalden aynısı: `cortexboard hub member <proje> <kim> [--role] [--scope] [--branches] [--remove]`.

## Rollerin yetkileri (`src/hub/roles.ts`)
- Sahip ve Yönetici: hepsi (read, ask, write_items, write_knowledge, delete_knowledge, approve, edit_rules, manage_members, reports, log_activity).
- Üye: read, ask, write_items, write_knowledge, approve, reports, log_activity.
- İzleyici: read, ask, reports.
- AI Okuyucu: read. AI Katkıcı: read, ask, write_items, write_knowledge (taslak olur), log_activity. AI Güvenilir: aynısı, bilgi yazımı doğrudan geçer.
- Hiçbir AI rolünde approve, edit_rules, manage_members yoktur. Ek dosya yüklemek write_items ister.

## Komutlar
`cortexboard hub init | start | add-project | member | invite` (`src/cli.ts` → `hubCommand`).

## Bağlı projeler (karar `01M3AM8C6VZ0WB1MA2SMANEQJH`, commit 8c9308d)
- Proje `cortex.config.yaml` → `linked: [backend]`. Okuma istekleri `?project=<id>` ile bağlı projeye yönlenir (MCP'de araçların `project` parametresi).
- Hub `preHandler`'ı (`src/hub/server.ts`): kaynak projede üyelik denetlenir; hedef `linked` içinde mi, hedefte üyelik var mı bakılır; sonra `req.cortex` hedef proje, `req.access` hedefteki üyelikten ve **salt okumaya kısılmış** (`readOnly`), `req.crossProject` = hedef. Cevaplar `project` alanı taşır.
- Yalnızca `GET` ve `CROSS_READS` (`/search`, `/tree`, `/node`, `/items`); diğerleri `cross_project_read_only`. Bağlı değilse `not_linked` (ipucunda bağlı liste), üye değilse 403.
- Brief `linked: [{ id, name, summary, readable }]`; okunamayan projenin özeti boş.
- Tek proje modunda `projectRoutes` `?project=`'i reddeder (sessizce kendi projesinden cevaplamasın).
- Projeler arası soru yok (reader rolünde `ask` yok); ayrı bir iş.

## Git: yalnızca pull (karar `01M3AM8C7QZG19TBK055EJYWXA`, commit 8c9308d)
- `src/hub/gitSync.ts` → `pullProject(dir)`: upstream yoksa atla; `fetch`; geride değilse güncel; yerel commit varsa atla (ayrışma insana); yoksa `merge --ff-only`. Sonuç: durum, mesaj, ahead/behind, `pending` (`.cortex` altında commit bekleyen dosya sayısı).
- Asenkron `execFile`, `GIT_TERMINAL_PROMPT=0`, 60 sn zaman aşımı: sunucu olay döngüsü ve parola sorusu yüzünden takılmaz.
- `Hub.pull(id)` proje başına tek çalışan; son sonuç bellekte (`hub.pulls`). `startPulling(pull_minutes)` `hub start`'ta açılır, varsayılan kapalı.
- Uçlar: `GET /api/p/:p/git`, `POST /api/p/:p/git/pull` (insan + approve); `/api/admin/projects` her projenin son çekmesini döndürür, Projeler tablosunda "Git" sütunu ve **Çek** düğmesi.
- CLI: `cortexboard hub pull [proje]`.
- Hub commit/push yapmaz; biriken `.cortex` değişikliklerini bir insan commit'ler.
