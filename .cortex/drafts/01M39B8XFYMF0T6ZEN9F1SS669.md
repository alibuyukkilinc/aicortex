---
kind: node
target: backend/hub
proposed_by: ai-agent
reason: c735ada server.ts'te yalnızca POST /api/admin/projects'e isteğe bağlı
  branches ekledi; düğümün anlattığı roller, görünürlük, sınırlar, ekranlar
  değişmedi.
base_rev: 7959be47
id: 01M39B8XFYMF0T6ZEN9F1SS669
proposed_at: 2026-09-24T09:17:17.182Z
data:
  path: backend/hub
  title: Ekip sunucusu (hub)
  summary: "Tek sunucu, çok proje: kişiler e-posta + şifreyle, AI ajanları token
    ile girer; proje başına rol ve görünürlük (SQL'de, sayfalamadan önce). Her
    kapıda deneme sınırı, 48 saatlik davet. Merkez verisi ~/.cortex/hub'da
    SQLite, proje bilgisi kendi reposunda."
  links:
    code:
      - file: src/hub/store.ts
      - file: src/hub/server.ts
      - file: src/hub/roles.ts
      - file: src/hub/access.ts
      - file: src/hub/crypto.ts
      - file: src/hub/limiter.ts
  verified_at_commit: c735ada9d0d8a0748942dd39eaaa969bd9e8d5a6
  id: 01M34ZBMQDA04RDK228RSTYEHP
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-24T09:17:17.176Z
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
- Davet 48 saat, tek kullanım; şifre belirleyince diğer oturumlar kapanır.
- `allowed_hosts` tanımlıysa listenin kendisidir; localhost için gizli istisna yok. Çerezin Secure bayrağı: `cookie_secure` verilmişse o, yoksa hub yalnızca loopback'te dinlemiyorsa açık; `trust_proxy: true` iken `X-Forwarded-Proto: https` de Secure yapar.
- **Organizasyon kavramı yok, tek düz hub:** `User.org_admin` sadece bir bayrak; true ise o kişi her projede otomatik Sahip sayılır. Birden fazla, birbirinden habersiz taraf hub'a girerse bu ayrı bir tur olarak ele alınmalı (bkz. karar `01M35AS75BZVM32EFWX3HBCW4H`: mobil ekip mevcut proje+üyelik modeliyle ayrı proje olarak katılabiliyor).
- **`GET /api/p/:project/members/candidates`**: org_admin için tüm hub roster'ı; org_admin olmayan proje sahibi/yöneticisi için yalnızca başka bir projede de owner/admin olduğu kişi/ajanlarla sınırlı. E-posta ile davet bu listeden bağımsız.
- Bilinen sınır: hub açtığı her projeyi yeniden başlayana kadar bellekte tutar (CHANGELOG'da yazılı).

## AI ajanları nasıl bağlanır
`cortexboard mcp --hub <url> --project <id> --token <t>`: MCP araçları merkezdeki proje API'sini kullanır (`remoteApi`), ajanın rolü ve görünürlüğü aynen geçerlidir. Bu bilgisayarda çalışmayan AI'lar (ör. ChatGPT) için MCP'nin HTTP ucu: `POST <url>/mcp/p/<proje>`, `Authorization: Bearer <ajan tokenı>`, durumsuz (GET ve DELETE 405). İstek aynı proje rotalarına yeniden yollanır; token, rol ve görünürlük REST ile birebir aynıdır.

## Ekranlar (kim neyi nereden yapar)
- **Kişi ekleme:** Organizasyon → Kişiler → "Kişi ekle". Sistem 48 saatlik tek kullanımlık davet bağlantısı verir; "Yeni bağlantı" aynı zamanda şifre sıfırlamadır.
- **AI ajanı ekleme:** Organizasyon → AI ajanları → "AI ajanı ekle". Token bir kez gösterilir; "Yeni token" eskisini geçersiz kılar.
- **Proje ekleme:** Organizasyon → Projeler → "Proje ekle" ya da `cortexboard hub add-project <klasör>`.
- **Üyelik ve görünürlük:** Proje panosunda Üyeler sayfası: rol, "her şeyi / yalnızca kendi kayıtlarını", dal kısıtı.

## Rollerin yetkileri (`src/hub/roles.ts`)
- Sahip ve Yönetici: hepsi (read, ask, write_items, write_knowledge, delete_knowledge, approve, edit_rules, manage_members, reports, log_activity).
- Üye: read, ask, write_items, write_knowledge, approve, reports, log_activity.
- İzleyici: read, ask, reports.
- AI Okuyucu: read. AI Katkıcı: read, ask, write_items, write_knowledge (taslak olur), log_activity. AI Güvenilir: aynısı, bilgi yazımı doğrudan geçer.
- Hiçbir AI rolünde approve, edit_rules, manage_members yoktur. Ek dosya yüklemek write_items ister.

## Komutlar
`cortexboard hub init | start | add-project | invite` (`src/cli.ts` → `hubCommand`).
