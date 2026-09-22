---
title: Ekip sunucusu (hub)
summary: "Tek sunucu, çok proje: kişiler e-posta + şifreyle, AI ajanları token
  ile girer; proje başına rol ve görünürlük. Merkez verisi ~/.cortex/hub'da
  SQLite (git'e girmez), proje bilgisi kendi reposunun .cortex klasöründe
  kalır."
tags:
  - hub
  - ekip
  - yetki
links:
  code:
    - file: src/hub/store.ts
    - file: src/hub/server.ts
    - file: src/hub/roles.ts
    - file: src/hub/access.ts
    - file: src/hub/crypto.ts
verified_at_commit: 22cc2549d317b2e5d2c6e4dbb92b402671c7213f
id: 01M34ZBMQDA04RDK228RSTYEHP
status: active
updated_by: ai-agent
updated_at: 2026-09-22T17:21:53.458Z
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

## Komutlar
`aicortex hub init | start | add-project | invite` (`src/cli.ts` → `hubCommand`).
