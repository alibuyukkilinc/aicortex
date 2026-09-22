---
id: 01M34Q58CPNFJGVSM7NNK58C61
type: decision
title: Cortex kendisi hiçbir zaman LLM çağırmaz
status: accepted
category_path: backend
author: ai-agent
fields:
  context: Araç token harcamamalı, API anahtarı istememeli ve çıktısı her
    seferinde aynı olmalı.
  alternatives: Yerleşik özetleme ya da kullanıcının anahtarıyla anlık AI cevabı
    (ileride isteğe bağlı olarak düşünülebilir).
  consequences: Çalıştırma maliyeti sıfır, sonuçlar tutarlı. AI'a sorulan sorular,
    AI'ın bir sonraki oturumunu bekler.
created_at: 2026-09-22T14:08:48.022Z
updated_at: 2026-09-22T14:57:31.851Z
updated_by: owner
---

Arama, raporlar, eskime ve brief hep hesaplanır. Yazma işini kullanıcının kendi AI'ı API üzerinden yapar.
