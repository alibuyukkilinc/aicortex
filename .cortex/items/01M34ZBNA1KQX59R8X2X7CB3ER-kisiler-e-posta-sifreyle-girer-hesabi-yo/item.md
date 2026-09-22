---
id: 01M34ZBNA1KQX59R8X2X7CB3ER
type: decision
title: Kişiler e-posta + şifreyle girer; hesabı yönetici davet bağlantısıyla açar
status: accepted
category_path: backend
author: ai-agent
fields:
  context: Harici servis (e-posta sunucusu, OAuth uygulaması) gerektirmeyen,
    herkesin anlayacağı bir giriş.
  alternatives: Şifresiz bağlantıyla giriş (her seferinde bağlantı iletmek
    gerekir); GitHub ile giriş (kurulum zorlaşır).
  consequences: Davet bağlantısını yönetici elle iletir; ileride e-posta gönderimi
    ve SSO eklenebilir.
created_at: 2026-09-22T16:32:06.465Z
updated_at: 2026-09-22T17:23:20.585Z
updated_by: alihanlaarsamobil
---

Yönetici kişiyi ekler, 7 gün geçerli tek kullanımlık bağlantı üretilir, kişi şifresini kendisi belirler. Aynı bağlantı şifre sıfırlama için kullanılır.
