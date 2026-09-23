---
id: 01M3837TYN730SW3BRBT5YWDAX
type: decision
title: Lint için ESLint + typescript-eslint yerine oxlint (tip bilgili)
status: proposed
category_path: code-structure
author: ai-agent
links:
  code:
    - file: .oxlintrc.json
    - file: package.json
fields:
  context: typescript-eslint TS 7 ile çalışmıyor (peer typescript <6.1, TS 7'nin
    JS API'si yok).
  consequences: ESLint ekosistemindeki bazı eklentiler yok; ihtiyaç olursa
    oxlint'in JS eklenti desteğine bakılır. TS 8/typescript-eslint desteği
    gelirse yeniden değerlendirilebilir.
created_at: 2026-09-23T21:37:38.773Z
updated_at: 2026-09-23T21:37:38.773Z
updated_by: ai-agent
---

Yol haritası (dilim 8) `eslint.config.js` + `typescript-eslint` diyordu. typescript-eslint TypeScript'in JS API'sine ihtiyaç duyar (peer: typescript <6.1); bu repo yerel TypeScript 7 ile derleniyor ve onda o API yok. Seçenekler: (a) yalnızca lint için TS 5.x'e dönmek ya da iki TS sürümü tutmak, (b) oxlint'in tip bilgili kipi (TS 7 üzerine kurulu tsgolint). (b) seçildi: aynı kurallar var (no-floating-promises, no-misused-promises, await-thenable, consistent-type-imports, react-hooks) ve dilim 10'daki jsx-a11y kuralları da oxlint'te mevcut.

Sonuç: `.oxlintrc.json`, `npm run lint` (uyarı da hata), `npm run format:check` (Prettier, printWidth 160). CI yalnızca ubuntu/Node 24 ayağında çalıştırır.
