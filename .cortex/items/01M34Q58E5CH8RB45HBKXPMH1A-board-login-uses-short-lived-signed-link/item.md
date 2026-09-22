---
id: 01M34Q58E5CH8RB45HBKXPMH1A
type: decision
title: Panoya giriş kısa ömürlü imzalı bağlantıyla, şifre yok
status: accepted
category_path: security
author: ai-agent
fields:
  context: "Yerel, tek bilgisayarlık bir araç: hesap ve şifre gerçek bir fayda
    sağlamadan zahmet eklerdi."
  alternatives: Şifre, OAuth ya da token'ı doğrudan adrese koymak (tarayıcı geçmişine sızar).
  consequences: Ekip sunucusu gelene kadar kullanıcı yönetimi yok; repoya komut
    satırından erişen herkes bağlantı üretebilir.
created_at: 2026-09-22T14:08:48.069Z
updated_at: 2026-09-22T14:57:18.564Z
updated_by: owner
---

`cortex login` aktörün token'ıyla imzalanmış 10 dakikalık bir bağlantı yazdırır; sunucu oturum çerezi verir. Yazımlar ayrıca CSRF başlığı ister.
