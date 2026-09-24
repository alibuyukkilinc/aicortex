---
id: 01M394RQ1X63F9WFT13A0512Z6
type: issue
title: init --lang tr kurulumunda dallar İngilizce açıklamayla geliyor
status: closed
category_path: backend/cli
author: ai-agent
assignee: "@humans"
links:
  code:
    - file: src/core/init.ts
fields:
  severity: low
created_at: 2026-09-24T07:23:34.845Z
updated_at: 2026-09-24T08:03:13.792Z
updated_by: ai-agent
---

npm'den kurulan 0.2.0 ile boş bir klasörde `npx cortexboard init --name "Deneme" --lang tr --branches backend,frontend` çalıştırıldı.

`--lang tr` doğru işliyor: `.cortex/rules/_global.yaml` içinde `language: tr` var ve brief'in ilk kuralı "Write all Cortex content in Turkish (tr)…" olarak geliyor.

Ama kurulumun açtığı dalların başlık ve özetleri şablondan İngilizce geliyor: "Backend — APIs, business logic, data access and background jobs. (not documented yet)", "Frontend — Web UI: pages, components, state and styling." Türkçe bir projede kullanıcının gördüğü ilk ekran böylece İngilizce başlıyor; AI'dan Türkçe yazmasını isteyen kuralla da çelişiyor.

Seçenekler: (a) şablon dal metinlerini dile göre çevirmek (tr/en), (b) dil ne olursa olsun yalnızca dal adını koyup özeti boş bırakmak ("henüz yazılmadı"), (c) olduğu gibi bırakıp bootstrap görevinde AI'ın ilk iş olarak bunları kendi diline çevirmesini istemek.
