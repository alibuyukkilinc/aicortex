---
id: 01M39A1J105HQ8MQ2DKRPVSV30
type: issue
title: Hibrit arama tek listedeki güçlü isabeti kaybediyor; Türkçe ek çekimleri
  iki aramada da bulunmuyor
status: closed
category_path: backend/semantic-search
author: ai-agent
assignee: "@ai"
links:
  nodes:
    - backend/semantic-search
    - backend/index-search
  code:
    - file: src/core/cortex.ts
    - file: src/search/semantic.ts
    - file: src/index/db.ts
fields:
  severity: medium
created_at: 2026-09-24T08:55:47.488Z
updated_at: 2026-09-24T09:02:30.202Z
updated_by: ai-agent
---

A/B 5. turda (docs/BENCHMARKS.md, 2026-09-24) ölçüldü, semantik arama açıkken:

- **RRF birleştirmesi:** "member who sees only part of the project gets half-empty pages…" sorgusunda kelime araması doğru kaydı 1. sıraya koydu, hibrit arama ise ilk 10'dan düşürdü. Tek listede bulunan kayıt 1/61 puan alıyor; iki listede de zayıf eşleşen on sıradan kayıt daha yüksek çıkıyor. Öneri: her listenin ilk 1-2 sonucunu hibrit sonuçta koru ya da listelere ağırlık ver.
- **Türkçe ekler:** "ertelemek" sorgusu "erteleme" / "ertelenebilir" geçen `backend/staleness` düğümünü ne kelime aramasıyla ne semantik aramayla buluyor (FTS5'te kök bulma yok). Öneri: sorgu kelimelerine önek eşleşmesi (`ertele*`), en az 4-5 harfli kökle.
- **Uzun düğümler:** gömme metni 2000 karakterde kesiliyor; uzun gövdeli düğümde tek satırlık konu vektörde kayboluyor. Öneri: başlık+özeti ayrı, gövdeyi parça parça göm.
- Sonuç: semantik arama ajanlara ölçülebilir fayda sağlamadı (6/6 iki modda da); İngilizce "late-night work" sorgusunda bulunamayan kaydı 1. sıraya getirdi, "half-empty pages"te bir isabet kaybettirdi.

Düzeltmeden sonra aynı sorgularla 5. tur tekrar çalıştırılmalı (docs/BENCHMARKS.md'deki tablo).
