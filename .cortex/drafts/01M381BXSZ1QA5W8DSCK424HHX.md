---
kind: node
target: security
proposed_by: ai-agent
reason: S4 pano çerezini API token'ından iptal edilebilir oturum anahtarına
  çevirdi ve gizli dosya izinlerini sıkılaştırdı; bağlı satır aralığı (40-80) da
  kaymıştı.
base_rev: c54c32b9
id: 01M381BXSZ1QA5W8DSCK424HHX
proposed_at: 2026-09-23T21:04:55.615Z
data:
  path: security
  title: Güvenlik modeli
  summary: "Tek proje: yalnızca localhost, sahibine özel token'lar (0600), 10
    dakikalık imzalı giriş bağlantısı, özetle saklanan iptal edilebilir pano
    oturumu. Hub: scrypt şifre, httpOnly oturum, CSRF başlığı, giriş sınırı,
    ajan tokenlarının özeti; rol ve görünürlük."
  links:
    code:
      - file: src/api/auth.ts
      - file: src/api/server.ts
        lines: 76-150
      - file: src/api/sessions.ts
      - file: src/core/project.ts
      - file: src/hub/server.ts
      - file: src/hub/crypto.ts
  verified_at_commit: 939f5db
  id: 01M34Q1CBF3AXG1Q0MKDJYKB6J
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-23T21:04:55.611Z
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
- Şifreler scrypt ile özetlenir, en az 10 karakter; davet ve oturum tokenları yalnızca SHA-256 özetiyle saklanır.
- Oturum çerezi httpOnly, SameSite=Lax, `public_url` https ise Secure; çerezle yazımlar `x-cortex-csrf` ister.
- Adres+e-posta başına 15 dakikada 10 hatalı giriş sınırı.
- Host kontrolü isteğe bağlı (`allowed_hosts`): hub her istekte kimlik istediği için DNS rebinding riski localhost aracındaki gibi değil.
- İnternete açılacaksa HTTPS arkasında (ters vekil) çalıştırılmalı; `hub start` ağa açıkken HTTPS yoksa uyarır.
- Henüz yok: SSO, iki adımlı doğrulama, e-postayla davet gönderimi.
