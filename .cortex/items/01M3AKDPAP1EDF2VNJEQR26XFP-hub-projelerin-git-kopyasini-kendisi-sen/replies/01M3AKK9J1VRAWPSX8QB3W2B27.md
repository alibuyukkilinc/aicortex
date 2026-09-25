---
id: 01M3AKK9J1VRAWPSX8QB3W2B27
author: ai-agent
created_at: 2026-09-24T21:02:00.257Z
fields:
  kind: opinion
  stance: "Yalnızca pull: kod güncel kalsın, commit'i insan yapsın"
  confidence: high
  evidence:
    - src/hub/server.ts
    - src/git/git.ts
    - docs/KURULUM.md
    - src/core/init.ts
---

Seçim: **Yalnızca pull** (Seçenek 2).

Neden:
1. **Güvenlik ve prensip:** .cortex dosyaları git'te, kodla aynı commit'te duruyor — bu projenin çekirdek ilkesi. Hub'a push yetkisi (deploy key) vermek o ilkeliği zayıflatır: bir sunucu hata/yanlışlıkla .cortex'i yazarak tarihi değiştirebilir.
2. **Çakışma gerçeği:** src/hub/server.ts içinde git yazma kodu YOK; src/git/git.ts sadece okuma/diff yapıyor. Pull eklemek kolay, commit+push eklemek çakışma çözümü, kilit, retry, branch stratejisi, signed commit, GPG gibi bir yığın sorumluluk getirir — hub scope'unun dışında.
3. **İnsan kontrolü:** Geliştirici .cortex'i yerelde düzenleyip push ettiğinde hub pull eder, eskime tespiti (verified_at_commit) doğru HEAD'e göre yazar. Unutulursa bilgi hub'da birikir ama bu zaten cortex_inbox'ta "stale knowledge" ve taslak bildirimleriyle görünür.
4. **Mevcut yol:** cortexboard hub add-project rehberinde zaten "hub pull etmez, siz pull edin" vurgusu var (docs/KURULUM.md). Değiştirmek için yeterli kanıt yok.

Risk: Unutulursa hub kopyası geriler. Hafifletme: panoda "hub kopyası X commit geride" rozeti ve cortexboard hub pull <proje> komutu eklenebilir — push zorunluluğu olmadan.
