---
title: Güvenlik modeli
summary: Yalnızca localhost'a cevap verir (Host başlığı DNS rebinding'e karşı
  kontrol edilir). Aktör token'ları git'e girmeyen .secrets.yaml'da. Pano girişi
  10 dakikalık imzalı bağlantı, sonra çerez + CSRF başlığı. Kurallar ve onaylar
  yalnızca insana ait.
tags:
  - giris
  - csrf
links:
  code:
    - file: src/api/auth.ts
    - file: src/api/server.ts
      lines: 40-80
verified_at_commit: d974755195f2cbd8301ad42d39a41c6250682b77
id: 01M34Q1CBF3AXG1Q0MKDJYKB6J
status: active
updated_by: ai-agent
updated_at: 2026-09-22T14:35:00.884Z
---

- `onRequest` kancası localhost/127.0.0.1/[::1] dışındaki her Host'u reddeder.
- Giriş kodu `<aktör>.<bitiş>.<imza>` aktörün kendi token'ıyla imzalanır: sunucuda durum tutmaz, token hiçbir zaman adres çubuğuna veya geçmişe düşmez.
- Çerezle yapılan yazımlar `x-cortex-csrf: 1` başlığı ister; başka bir site bunu CORS olmadan gönderemez, CORS da hiç açılmaz.
- Aktör adları dosya adı olarak kullanıldığı için denetlenir.
- Henüz yok: gerçek kullanıcı hesapları ve roller (ekip sunucusuyla gelecek).
