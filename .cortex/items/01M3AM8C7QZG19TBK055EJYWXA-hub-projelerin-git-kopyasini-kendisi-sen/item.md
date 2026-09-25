---
id: 01M3AM8C7QZG19TBK055EJYWXA
type: decision
title: "Hub, projelerin git kopyasını kendisi senkronlasın mı (pull + .cortex
  commit/push)? → Yalnızca pull: kod güncel kalsın, commit'i insan yapsın"
status: accepted
category_path: backend/hub
author: ai-agent
links:
  items:
    - 01M3AKDPAP1EDF2VNJEQR26XFP
fields:
  context: >-
    Hub, projelerin git kopyasını kendisi senkronlasın mı (pull + .cortex
    commit/push)?


    **Durum.** Hub her projeyi sunucudaki bir klasörden okuyor ve git'e hiç
    dokunmuyor. `src/hub/` içinde pull, commit ya da push yok; `src/git/git.ts`
    yalnızca okuma yapıyor (eskime tespiti için diff).


    **Sonuçları:**

    - Ajanların hub üzerinden yazdığı bilgiler, kayıtlar ve aktivite hub
    makinesindeki kopyada birikiyor. Biri oradan commit + push etmezse repoya ve
    geliştiricilerin yerel kopyalarına ulaşmıyor.

    - Geliştiricilerin push'ladığı kod hub'daki kopyaya pull edilmezse eskime
    tespiti eski koda bakıyor ve `verified_at_commit` yanlış bir HEAD'e göre
    yazılıyor.

    - Bir geliştirici yerelde `.cortex`'i düzenleyip push ederse hub'daki
    kopyayla çakışabilir.


    **Seçenekler:**

    1. **Tam senkron:** ayarlanabilir aralıkla `git pull --rebase`; `.cortex`
    değişiklikleri toplu commit ("Knowledge: …") ve push. Çakışmada durur,
    panoda uyarı verir. Hub'a git yazma yetkisi (deploy key) gerekir.

    2. **Yalnızca pull:** kod ve dışarıdan gelen `.cortex` değişiklikleri güncel
    kalır; `.cortex` commit'i bir insanın elinde kalır. Daha güvenli, ama
    unutulursa bilgi hub'da birikir.

    3. **Dışarıda çözülsün:** hub git'e dokunmaz; kurulum belgesine cron/systemd
    betiği eklenir.

    4. **Hub kendi veritabanında tutsun:** dosya + git "tek doğruluk kaynağı"
    ilkesinden vazgeçilir, git'e dışa aktarım yapılır. Büyük mimari değişiklik.


    **Görüş yazarken:** `.cortex`'in git'te durması bu projenin temel
    ilkelerinden (git dostu, kod ile bilgi birlikte sürümlenir). Güvenlik
    (sunucuda push yetkisi), çakışma davranışı, birden fazla geliştiricinin
    yerelde `.cortex` düzenlemesi ve kurulum kolaylığı üzerinden değerlendir.
  alternatives: >-
    - Evet: periyodik pull + .cortex değişikliklerini toplu commit/push: 1
    vote(s) (chatgpt)

    - Hayır: sunucuda cron/betik ile dışarıda çözülsün: 0 vote(s)

    - Hub bilgiyi kendi veritabanında tutsun, git'e dışa aktarsın: 0 vote(s)


    Views:

    - ai-agent (Yalnızca pull: kod güncel kalsın, commit'i insan yapsın, high):
    Seçim: **Yalnızca pull** (Seçenek 2). Neden: 1. **Güvenlik ve prensip:**
    .cortex dosyaları git'te, kodla aynı commit'te duruyor — bu projenin
    çekirdek ilkesi. Hub'a push yetkisi (deploy key) vermek o ilkeliği
    zayıflatır: bir sunucu hata/yanlışlıkla .cortex'i yazarak tarihi
    değiştirebilir. 2.… [src/hub/server.ts, src/git/git.ts, docs/KURULUM.md,
    src/core/init.ts]

    - chatgpt (Evet: periyodik pull + .cortex değişikliklerini toplu
    commit/push, medium): Hub içinde, proje yöneticisinin açıkça etkinleştirdiği
    yönetilen senkronizasyonu destekliyorum. Bu oy, açıklamadaki git pull
    --rebase komutunu mevcut çalışan klasöre doğrudan zamanlayıcıyla ekleme
    önerisi değildir; yazıların korunması ve toparlanma davranışı bu seçeneğin
    kabul koşulu olmalı. Kodda… [src/hub/server.ts:30-45, src/git/git.ts:17-56,
    src/git/git.ts:75-79, src/core/staleness.ts:51-83,
    src/core/cortex.ts:147-198]

    - antigravity (Yalnızca pull: kod güncel kalsın, commit'i insan yapsın,
    high): Seçim: **Yalnızca pull: kod güncel kalsın, commit'i insan yapsın**
    (Seçenek 2). Gerekçeler: 1. **Mimari Uygunluk ve Karmaşıklık:**
    `src/git/git.ts` incelendiğinde Git sarmalayıcısının yalnızca diff ve commit
    hash okuyan salt-okunur bir yapıda olduğu görülür (git.ts:17-85). Hub'a
    otomatik commit ve… [src/git/git.ts:17-85, src/hub/server.ts:30-45,
    src/core/staleness.ts:51-83, backend/hub, backend/staleness]
created_at: 2026-09-24T21:13:31.127Z
updated_at: 2026-09-24T21:19:05.902Z
updated_by: alihanlaarsamobil
---

Yalnızca pull: kod güncel kalsın, commit'i insan yapsın

Votes: 2 of 3 (ai-agent, antigravity).
