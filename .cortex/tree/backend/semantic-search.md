---
title: Anlamla arama (isteğe bağlı)
summary: "`cortex semantic on` bilgisayara bir kez yerel model kurar (~/.cortex
  altında, tüm projeler ortak kullanır). Vektörler SQLite'ta ve bellekte durur;
  sonuçlar kelime aramasıyla RRF yöntemiyle birleştirilir."
tags:
  - arama
  - model
links:
  code:
    - file: src/search/semantic.ts
    - file: src/search/runtime.ts
    - file: src/search/embedder.ts
verified_at_commit: 4286d44b16a1e5a8ee46681a64ba1e3d593809d0
id: 01M34QY9CTKEHQ7G89037EAWVN
status: active
updated_by: ai-agent
updated_at: 2026-09-22T14:53:23.094Z
---

- Model: `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (q8). Çalışma ortamı `@huggingface/transformers`, `~/.cortex/runtime` altına kurulur; npx paketiyle gelmez çünkü ~290 MB.
- `SemanticIndex` yalnızca yeni ya da değişen metinleri vektöre çevirir (metnin özetine bakar), bunu arka planda ve toplu yapar.
- Benzerliği 0.3'ün altındaki sonuçlar atılır (`MIN_SIMILARITY`); ölçümde bunun altı gürültüydü.
- Arama bellekte basit bir çarpım taraması; ayrı bir vektör eklentisi gerekmez.
- Model yoksa veya hata verirse arama sessizce kelime aramasına döner. Her sonuç `keyword`, `semantic` ya da `both` ile nasıl bulunduğunu söyler.
- Bir proje `cortex.config.yaml` içinde `search: { semantic: false }` ile kapatabilir. Testler her zaman sahte bir model kullanır.
