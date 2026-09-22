---
id: 01M34ZBNA8Y6081XZFMEFA22BR
type: decision
title: Proje bilgisi kendi reposunda kalır; merkez yalnızca kişileri, rolleri ve
  proje listesini tutar
status: accepted
category_path: backend
author: ai-agent
fields:
  context: Git dostu ilke korunmalı; şifreler ve oturumlar asla bir repoya girmemeli.
  alternatives: Tüm projelerin verisini merkezde tutmak (bilginin kodla birlikte
    sürümlenmesi kaybolur).
  consequences: Merkez projelerin klasörlerine erişebilmeli (aynı sunucuda repo
    kopyaları). Üyeler bellekte aktör listesine eklenir, proje dosyasına
    yazılmaz.
created_at: 2026-09-22T16:32:06.472Z
updated_at: 2026-09-22T19:09:55.059Z
updated_by: owner
---

Her projenin .cortex klasörü kendi reposunda; merkez (~/.cortex/hub, SQLite) kişileri, şifre özetlerini, oturumları, ajanları, proje yollarını ve üyelikleri tutar ve git'e girmez.
