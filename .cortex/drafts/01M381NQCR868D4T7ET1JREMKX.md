---
kind: node
target: security
proposed_by: ai-agent
reason: S4 (pano oturumu, gizli dosya izinleri) ve S5 (hub host listesi, genel
  deneme sınırı, Secure çerez ayarı, 48 saatlik davet).
base_rev: c54c32b9
id: 01M381NQCR868D4T7ET1JREMKX
proposed_at: 2026-09-23T21:10:16.728Z
data:
  path: security
  title: Güvenlik modeli
  summary: "Tek proje: yalnızca localhost, sahibine özel token'lar (0600), 10
    dakikalık imzalı giriş bağlantısı, özetle saklanan iptal edilebilir pano
    oturumu. Hub: scrypt şifre, httpOnly oturum, CSRF başlığı, her kapıda deneme
    sınırı, ajan tokenlarının özeti; rol ve görünürlük."
  links:
    code:
      - file: src/api/auth.ts
      - file: src/api/server.ts
        lines: 76-150
      - file: src/api/sessions.ts
      - file: src/core/project.ts
      - file: src/hub/server.ts
      - file: src/hub/limiter.ts
      - file: src/hub/crypto.ts
  verified_at_commit: cdcacb0
  id: 01M34Q1CBF3AXG1Q0MKDJYKB6J
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-23T21:10:16.717Z
---

- `onRequest` kancası localhost/127.0.0.1/[::1] dışındaki her Host'u reddeder.
- Giriş kodu `<aktör>.<bitiş>.<imza>` aktörün kendi token'ıyla imzalanır: sunucuda durum tutmaz, token hiçbir zaman adres çubuğuna veya geçmişe düşmez.
- Pano oturumu (`src/api/sessions.ts`): `/login` rastgele bir oturum anahtarı verir; çerez API token'ı DEĞİLDİR. `.cortex/.sessions.json` yalnızca SHA-256 özetini tutar (`src/hub/crypto.ts` ilkelleri), 30 gün geçerli, 0600, git'e girmez (eski projelerde ilk yazımda `.gitignore`'a eklenir). `/api/logout` oturumu siler; `cortex logout [--actor] [--all]` çalışan sunucudaki oturumları da bitirir (dosya değişim zamanıyla yeniden okunur).
- Geçiş: ham token taşıyan eski çerez bir kez kabul edilip yeni oturumla değiştirilir (aynı anda gelen istekler aynı oturumu alır); yalnızca insan aktörler. 0.2.x sonrası kaldırılacak.
- Bearer yolu (AI'lar, betikler) değişmedi. Token araması her istekte dosya okumaz: `loadTokens` değişim zamanı+boyutla önbellekler; karşılaştırma SHA-256 özetleri üzerinde `timingSafeEqual` ile, erken çıkmadan tüm girdilere bakar.
- `.secrets.yaml` `init`'te 0600 yazılır; POSIX'te daha gevşek izinli eski dosya ilk okumada 0600'a çekilir. Windows'ta izin kipi yok, kullanıcı profili ACL'leri geçerli.
- Çerezle yapılan yazımlar `x-cortex-csrf: 1` başlığı ister; başka bir site bunu CORS olmadan gönderemez, CORS da hiç açılmaz.
- Aktör adları dosya adı olarak kullanıldığı için denetlenir.
## Hub
- Şifreler scrypt ile özetlenir, en az 10 karakter; davet ve oturum tokenları yalnızca SHA-256 özetiyle saklanır. Davet 48 saat geçerli, tek kullanımlık.
- Oturum çerezi httpOnly, SameSite=Lax. Secure: `hub.yaml` → `cookie_secure` verilmişse o; verilmemişse hub yalnızca loopback'te dinlemiyorsa açık. `trust_proxy: true` iken (yalnızca kendi ters vekilinin arkasında) `X-Forwarded-Proto: https` de Secure yapar ve istemci adresi `X-Forwarded-For`'dan alınır. Çerezle yazımlar `x-cortex-csrf` ister.
- Deneme sınırı (`src/hub/limiter.ts`, 15 dakikalık pencere): adres+e-posta başına 10 hatalı şifre; adres başına 10 hatalı ajan token'ı (REST ve `/mcp/p/:project` birlikte sayılır); adres başına 20 geçersiz davet bağlantısı. Süresi dolan anahtarlar zamanlayıcıyla silinir, anahtar sayısı üst sınırlıdır (en eskiler düşer): saldırgan belleği büyütemez, yalnızca unutturabilir.
- Host kontrolü isteğe bağlı (`allowed_hosts`). Tanımlıysa listenin kendisidir: localhost için gizli istisna yok (vekil arkasında her istek "localhost" diyebilir). Hub her istekte kimlik istediği için DNS rebinding riski localhost aracındaki gibi değil.
- İnternete açılacaksa HTTPS arkasında (ters vekil) çalıştırılmalı; `hub start` ağa açıkken HTTPS yoksa uyarır ve çerezin Secure olduğunu söyler.
- Henüz yok: SSO, iki adımlı doğrulama, e-postayla davet gönderimi.
