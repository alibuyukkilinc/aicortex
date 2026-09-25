---
id: 01M3AJF3RYE2NB30ZNVAAB0595
type: task
title: "Tasarım 2. tur: kalan satır içi stiller ve yeni ölçeğin yayılması"
status: backlog
category_path: frontend
author: ai-agent
assignee: "@ai"
links:
  items:
    - 01M3AJ1SRRPTM51GFWVBVT78PS
    - 01M3AHHGHTMCEMGPQZZ55FV60W
  code:
    - file: web/src/items.tsx
    - file: web/src/pages/Reports.tsx
    - file: web/src/pages/Knowledge.tsx
    - file: web/src/hub.tsx
fields:
  priority: medium
created_at: 2026-09-24T20:42:14.686Z
updated_at: 2026-09-24T20:42:14.686Z
updated_by: ai-agent
---

Karar 01M3AJ1SRRPTM51GFWVBVT78PS ("Evet gidelim") için 1. tur commit 4a00567 ile bitti. Kalanlar:

- **96 satır içi stil** kaldı; çoğu items.tsx, Reports.tsx, Knowledge.tsx ve hub.tsx içinde, tek seferlik boşluk ve düzen değerleri. Bunları sınıflara ve `--space-*` ölçeğine taşı.
- Yeni stillerde sabit px boşluk yerine `--space-1..6` kullan; eski kurallarda boşluklar hâlâ px.
- `Loading` ve `EmptyState` artık ortak bileşen: hub ekranlarındaki (`hub.noProjects`, `usage.empty`) ve Bilgi sayfasındaki boş durumlar hâlâ eski `.empty` sınıfında.
- ChatGPT'nin önerisi: değişikliği gerçek içerikle ölç (kayıt bulma, kart taşıma, görüş bildirme süresi; klavye ve dar ekran). 1. tur yalnızca ekran görüntüsüyle doğrulandı.
