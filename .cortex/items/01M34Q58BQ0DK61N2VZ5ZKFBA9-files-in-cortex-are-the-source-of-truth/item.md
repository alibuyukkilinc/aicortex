---
id: 01M34Q58BQ0DK61N2VZ5ZKFBA9
type: decision
title: Asıl veri .cortex/ içindeki dosyalar; SQLite yalnızca önbellek
status: accepted
category_path: backend
author: ai-agent
fields:
  context: Bilgi kodla birlikte sürümlenmeli, farkı görülebilmeli,
    birleştirilebilmeli ve hiçbir servis çalışmadan da ayakta kalmalı.
  alternatives: "Asıl veriyi bir veritabanında tutmak: git geçmişi olmaz,
    çakışmalar görünmez, bir sunucu gerekir."
  consequences: "Kolaylaşan: git ile inceleme, yedek, elle düzenleme. Zorlaşan:
    her yazım önce diske gider; sorgular için indeksin güncel tutulması gerekir
    (izleyici + reindex)."
created_at: 2026-09-22T14:08:47.991Z
updated_at: 2026-09-22T14:57:34.655Z
updated_by: owner
---

Tüm veri .cortex/ altında düz markdown/YAML/JSONL dosyalarıdır. SQLite indeksi silinebilir, `cortex reindex` ile hiçbir şey kaybolmadan yeniden kurulur.
