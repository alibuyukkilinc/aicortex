---
id: 01M3AKDPAP1EDF2VNJEQR26XFP
type: discussion
title: Hub, projelerin git kopyasını kendisi senkronlasın mı (pull + .cortex
  commit/push)?
status: decided
category_path: backend/hub
author: ai-agent
links:
  nodes:
    - backend/hub
    - backend/staleness
  code:
    - file: src/hub/server.ts
    - file: src/git/git.ts
    - file: src/core/staleness.ts
fields:
  options:
    - "Evet: periyodik pull + .cortex değişikliklerini toplu commit/push"
    - "Yalnızca pull: kod güncel kalsın, commit'i insan yapsın"
    - "Hayır: sunucuda cron/betik ile dışarıda çözülsün"
    - Hub bilgiyi kendi veritabanında tutsun, git'e dışa aktarsın
  outcome: 01M3AM8C7QZG19TBK055EJYWXA
created_at: 2026-09-24T20:58:56.726Z
updated_at: 2026-09-24T21:27:12.749Z
updated_by: ai-agent
---

**Durum.** Hub her projeyi sunucudaki bir klasörden okuyor ve git'e hiç dokunmuyor. `src/hub/` içinde pull, commit ya da push yok; `src/git/git.ts` yalnızca okuma yapıyor (eskime tespiti için diff).

**Sonuçları:**
- Ajanların hub üzerinden yazdığı bilgiler, kayıtlar ve aktivite hub makinesindeki kopyada birikiyor. Biri oradan commit + push etmezse repoya ve geliştiricilerin yerel kopyalarına ulaşmıyor.
- Geliştiricilerin push'ladığı kod hub'daki kopyaya pull edilmezse eskime tespiti eski koda bakıyor ve `verified_at_commit` yanlış bir HEAD'e göre yazılıyor.
- Bir geliştirici yerelde `.cortex`'i düzenleyip push ederse hub'daki kopyayla çakışabilir.

**Seçenekler:**
1. **Tam senkron:** ayarlanabilir aralıkla `git pull --rebase`; `.cortex` değişiklikleri toplu commit ("Knowledge: …") ve push. Çakışmada durur, panoda uyarı verir. Hub'a git yazma yetkisi (deploy key) gerekir.
2. **Yalnızca pull:** kod ve dışarıdan gelen `.cortex` değişiklikleri güncel kalır; `.cortex` commit'i bir insanın elinde kalır. Daha güvenli, ama unutulursa bilgi hub'da birikir.
3. **Dışarıda çözülsün:** hub git'e dokunmaz; kurulum belgesine cron/systemd betiği eklenir.
4. **Hub kendi veritabanında tutsun:** dosya + git "tek doğruluk kaynağı" ilkesinden vazgeçilir, git'e dışa aktarım yapılır. Büyük mimari değişiklik.

**Görüş yazarken:** `.cortex`'in git'te durması bu projenin temel ilkelerinden (git dostu, kod ile bilgi birlikte sürümlenir). Güvenlik (sunucuda push yetkisi), çakışma davranışı, birden fazla geliştiricinin yerelde `.cortex` düzenlemesi ve kurulum kolaylığı üzerinden değerlendir.
