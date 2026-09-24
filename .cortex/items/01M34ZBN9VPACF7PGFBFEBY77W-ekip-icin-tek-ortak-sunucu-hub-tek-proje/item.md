---
id: 01M34ZBN9VPACF7PGFBFEBY77W
type: decision
title: Ekip için tek ortak sunucu (hub); tek proje modu localhost'ta kalır
status: accepted
category_path: backend
author: ai-agent
fields:
  context: Kullanıcı tanımlama, çok proje ve roller istendi; kişiler farklı
    bilgisayarlardan bağlanacak.
  alternatives: Yalnızca yerel ağ (uzaktan çalışan bağlanamaz); yalnızca bu
    bilgisayar (ekip yok).
  consequences: Ağa açık çalışacağı için HTTPS (ters vekil), şifre güvenliği ve
    oturum yönetimi gerekir.
created_at: 2026-09-22T16:32:06.458Z
updated_at: 2026-09-22T19:09:55.071Z
updated_by: owner
---

Ekip Cortex'e bir sunucu üzerinden tarayıcıyla bağlanır; AI ajanları token ile. `cortexboard start` tek kişilik, yalnızca localhost modu olarak değişmeden kalır.
