---
title: Güvenlik modeli
summary: "Tek proje: yalnızca localhost, git'e girmeyen token'lar, 10 dakikalık
  imzalı giriş bağlantısı. Hub: e-posta + scrypt şifre, httpOnly oturum çerezi,
  CSRF başlığı, giriş deneme sınırı, ajan tokenlarının yalnızca özeti; proje
  başına rol ve görünürlük. Kurallar ve onaylar insana ait."
tags:
  - giris
  - csrf
links:
  code:
    - file: src/api/auth.ts
    - file: src/api/server.ts
      lines: 40-80
    - file: src/hub/server.ts
    - file: src/hub/crypto.ts
verified_at_commit: 22cc2549d317b2e5d2c6e4dbb92b402671c7213f
id: 01M34Q1CBF3AXG1Q0MKDJYKB6J
status: active
updated_by: ai-agent
updated_at: 2026-09-22T17:21:53.430Z
---

- `onRequest` kancası localhost/127.0.0.1/[::1] dışındaki her Host'u reddeder.
- Giriş kodu `<aktör>.<bitiş>.<imza>` aktörün kendi token'ıyla imzalanır: sunucuda durum tutmaz, token hiçbir zaman adres çubuğuna veya geçmişe düşmez.
- Çerezle yapılan yazımlar `x-cortex-csrf: 1` başlığı ister; başka bir site bunu CORS olmadan gönderemez, CORS da hiç açılmaz.
- Aktör adları dosya adı olarak kullanıldığı için denetlenir.
## Hub
- Şifreler scrypt ile özetlenir, en az 10 karakter; davet ve oturum tokenları yalnızca SHA-256 özetiyle saklanır.
- Oturum çerezi httpOnly, SameSite=Lax, `public_url` https ise Secure; çerezle yazımlar `x-cortex-csrf` ister.
- Adres+e-posta başına 15 dakikada 10 hatalı giriş sınırı.
- Host kontrolü isteğe bağlı (`allowed_hosts`): hub her istekte kimlik istediği için DNS rebinding riski localhost aracındaki gibi değil.
- İnternete açılacaksa HTTPS arkasında (ters vekil) çalıştırılmalı; `hub start` ağa açıkken HTTPS yoksa uyarır.
- Henüz yok: SSO, iki adımlı doğrulama, e-postayla davet gönderimi.
