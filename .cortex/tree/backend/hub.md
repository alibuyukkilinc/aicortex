---
title: Ekip sunucusu (hub)
summary: "Tek sunucu, çok proje: kişiler e-posta + şifreyle, AI ajanları token
  ile girer; proje başına rol ve görünürlük. Merkez verisi ~/.cortex/hub'da
  SQLite (git'e girmez), proje bilgisi kendi reposunun .cortex klasöründe
  kalır."
links:
  code:
    - file: src/hub/store.ts
    - file: src/hub/server.ts
    - file: src/hub/roles.ts
    - file: src/hub/access.ts
    - file: src/hub/crypto.ts
verified_at_commit: c208862f1da407becc33ea8d1dd0d1eee72911f9
id: 01M34ZBMQDA04RDK228RSTYEHP
status: active
updated_by: ai-agent
updated_at: 2026-09-22T23:17:57.183Z
---

## Parçalar (`src/hub`)
- `store.ts`: SQLite (`hub.db`) + `hub.yaml` ayarları. Tablolar: users (scrypt şifre özeti), sessions, invites, agents (token özeti), projects (klasör yolu), members (proje, kişi/ajan, rol, scope, branches). Kimlikler (`ali`, `claude-code`) kişi ve ajanlar arasında benzersiz, çünkü projelerin dosyalarında aktör adı olarak görünürler.
- `crypto.ts`: scrypt (N=16384), tokenlar rastgele 32 bayt ve yalnızca SHA-256 özeti saklanır; bulunmayan hesapta da aynı süre harcanır.
- `roles.ts`: insan rolleri owner/admin/member/viewer, AI rolleri reader/contributor/trusted; her rolün yetki listesi ve `trusted` için `{ node: "auto" }` onay istisnası (`Actor.policy`).
- `access.ts`: üyelikten `Access` nesnesi: `can(perm)`, `seesNode`, `seesItem`, `seesActivity`, `restricted`.
- `server.ts`: `Hub` her projeyi ilk kullanımda açar (`Cortex` + watch) ve üyeleri bellekte aktör listesine ekler (`syncActors`, dosyaya yazmaz). `buildHubServer`: giriş, davet, organizasyon yönetimi (/api/admin/*), proje API'si (/api/p/:project/*, ortak `projectRoutes`) ve üyeler.

## Kurallar
- Organizasyon yöneticileri her projede Sahip sayılır; son sahip çıkarılamaz; sahipliği yalnızca sahipler değiştirir; kendini devre dışı bırakamazsın, son organizasyon yöneticisi kaldırılamaz.
- AI hiçbir rolde onaylayamaz, kural değiştiremez, üye yönetemez (rol listesinde yok, çekirdek de insan ister).
- Görünürlük: scope `own` = yazdığı veya kendisine/grubuna (@humans, @ai) atanan kayıtlar; `branches` = yalnızca o dallar (atası olan dallar gezinmek için görünür). Gizli olan 404 döner.
- Giriş: 15 dakikada adres+e-posta başına 10 hatalı deneme sınırı; davet 7 gün, tek kullanım, şifre belirleyince diğer oturumlar kapanır.
- **Organizasyon kavramı yok, tek düz hub:** `User.org_admin` sadece bir bayrak; true ise o kişi her projede otomatik Sahip sayılır (ayrı bir organizasyon/takım tablosu yok). Bugün için yeterli (tüm projeler tek kişiye ait); birden fazla, birbirinden habersiz taraf hub'a girerse bu ayrı bir tur olarak ele alınmalı (bkz. proposed→accepted karar `01M35AS75BZVM32EFWX3HBCW4H`: mobil ekip mevcut proje+üyelik modeliyle, kod değişikliği olmadan ayrı proje olarak katılabiliyor).
- **`GET /api/p/:project/members/candidates`** (üyeliğe eklenebilecek kişi/ajan önerileri): org_admin için hâlâ tüm hub roster'ı; org_admin olmayan proje sahibi/yöneticisi için yalnızca **başka bir projede de owner/admin olduğu** kişi/ajanlarla sınırlı — hub'daki ilgisiz herkesin kimliğini görmesin diye. E-posta ile davet bu listeden bağımsız, her zaman çalışır.

## AI ajanları nasıl bağlanır
`aicortex mcp --hub <url> --project <id> --token <t>`: MCP araçları merkezdeki proje API'sini kullanır (`remoteApi`), ajanın rolü ve görünürlüğü aynen geçerlidir. MCP konuşamayan araçlar aynı uçları düz HTTP ile kullanabilir.
Bu bilgisayarda çalışmayan AI'lar (ör. ChatGPT) için merkezde MCP'nin HTTP ucu vardır: `POST <url>/mcp/p/<proje>`, `Authorization: Bearer <ajan tokenı>`, akış destekli HTTP, durumsuz (GET ve DELETE 405 döner). İstek, aynı proje rotalarına yeniden yollanır; token, rol ve görünürlük REST ile birebir aynıdır. Bilinmeyen token ya da üye olunmayan proje bağlantı anında reddedilir. stdio köprüsü (`aicortex mcp --hub …`) da desteklenmeye devam eder.

## Ekranlar (kim neyi nereden yapar)
- **Kişi ekleme:** Organizasyon → Kişiler → "Kişi ekle" (e-posta, ad, isteğe bağlı ilk proje + rol). Sistem tek kullanımlık davet bağlantısı verir; kişi şifresini kendisi belirler. "Yeni bağlantı" aynı zamanda şifre sıfırlamadır.
- **AI ajanı ekleme:** Organizasyon → AI ajanları → "AI ajanı ekle" (kimlik, ad, ilk proje + rol). Token bir kez gösterilir; "Yeni token" eskisini geçersiz kılar.
- **Proje ekleme:** Organizasyon → Projeler → "Proje ekle" (sunucudaki klasör; .cortex yoksa oluşturulabilir) ya da `aicortex hub add-project <klasör>`.
- **Üyelik ve görünürlük:** Proje panosunda Üyeler sayfası: rol, "her şeyi / yalnızca kendi kayıtlarını", dal kısıtı.

## Rollerin yetkileri (`src/hub/roles.ts`)
- Sahip ve Yönetici: hepsi (read, ask, write_items, write_knowledge, delete_knowledge, approve, edit_rules, manage_members, reports, log_activity).
- Üye: read, ask, write_items, write_knowledge, approve, reports, log_activity. Kural düzenleme, düğüm silme ve üye yönetimi yok.
- İzleyici: read, ask, reports.
- AI Okuyucu: read. AI Katkıcı: read, ask, write_items, write_knowledge (taslak olur), log_activity. AI Güvenilir: aynısı, bilgi yazımı doğrudan geçer.
- Hiçbir AI rolünde approve, edit_rules, manage_members yoktur.

## Komutlar
`aicortex hub init | start | add-project | invite` (`src/cli.ts` → `hubCommand`).
