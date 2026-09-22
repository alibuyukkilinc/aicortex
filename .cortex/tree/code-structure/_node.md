---
title: Kod yapısı ve alışkanlıklar
summary: src/{core,store,index,search,git,api,mcp,util}, web/src, test/. ESM
  TypeScript 7, girdiler zod ile denetlenir, yorumlar 'neden'i anlatır. Testler
  gerçek geçici projeler ve gerçek git depolarıyla çalışır.
tags:
  - alisakanliklar
links:
  code:
    - file: test/helpers.ts
verified_at_commit: d974755195f2cbd8301ad42d39a41c6250682b77
id: 01M34Q1CBH9Y1DPA0KSNF0G7D3
status: active
updated_by: ai-agent
updated_at: 2026-09-22T14:35:00.888Z
---

- `src/core`: iş mantığı. `src/store`: yalnızca dosya okuma/yazma. `src/index`: SQLite önbelleği. Arayüz katmanlarında mantık olmaz.
- Denetim: zod şemaları servisin yanında (`NodeInput`, `CreateItemInput`, `ActivityInput`); hatalar `CortexError(kod, mesaj, durum, ipucu)`.
- Testler: `test/*.test.ts`, node:test. `test/helpers.ts` içindeki `tempProject()` gerçek, kurulmuş bir proje açar (dili sabit `en`); eskime testleri gerçek commit'ler atar.
