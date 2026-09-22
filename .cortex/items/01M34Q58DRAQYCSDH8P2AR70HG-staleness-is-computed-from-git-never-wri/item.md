---
id: 01M34Q58DRAQYCSDH8P2AR70HG
type: decision
title: Eskime git'ten hesaplanır, düğüm dosyalarına yazılmaz
status: proposed
category_path: backend
author: ai-agent
fields:
  context: Dosyalara 'eskimiş' bayrağı yazmak, kod her değiştiğinde gereksiz
    commit'ler üretirdi.
  alternatives: Bir kanca veya CI işiyle güncellenen, dosya başlığında duran bir
    'eskimiş' alanı.
  consequences: Çalışırken git çağrıları yapılır (sınırlandırılmış, HEAD 5 sn'de
    bir kontrol edilir). Git dışında bu özellik kapalıdır.
created_at: 2026-09-22T14:08:48.056Z
updated_at: 2026-09-22T14:23:22.017Z
updated_by: ai-agent
---

Düğüm yalnızca verified_at_commit bilgisini saklar. Eskimiş olup olmadığı, bağlı kodun git farkından anında hesaplanır.
