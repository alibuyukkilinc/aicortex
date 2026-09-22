---
id: 01M34Q58EGE9M7NK9SWM4G7TVD
type: decision
title: Rapor günleri projenin saat diliminde, takvim gününe hizalı
status: accepted
category_path: backend
author: ai-agent
fields:
  context: İlk sürüm 7×24 saat geriye sayıyordu (8 yarım gün). UTC'ye hizalamak
    bunu çözdü ama Türkiye'de 00:00-03:00 arası işler bir önceki güne düşüyordu.
    Proje sahibi saat dilimi ayarı istedi.
  alternatives: Kayan 24 saatlik pencere (grafik karışık); hep UTC (gece işleri
    yanlış güne düşer); izleyenin tarayıcı saat dilimi (aynı rapor kişiden
    kişiye farklı olur).
  consequences: Rapor herkes için aynı; saat dilimi insanın kontrolünde bir ayar.
    Yaz saati geçişi olan günler 23/25 saat sürebilir, bu doğru hesaplanıyor.
created_at: 2026-09-22T14:08:48.080Z
updated_at: 2026-09-22T14:55:58.185Z
updated_by: owner
---

'7 gün' = bugün + önceki 6 gün, projenin saat diliminde (cortex.config.yaml → timezone, ör. Europe/Istanbul). Ayar yoksa UTC. 7 günlük grafik tam 7 sütun gösterir.
