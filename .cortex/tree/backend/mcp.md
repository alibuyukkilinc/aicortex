---
title: MCP sunucusu
summary: "`aicortex mcp` stdio üzerinden 18 araç sunar. Araçlar proje REST
  API'sini konuşur: yerel projede süreç içinde, merkezdeki projede `--hub <url>
  --project <id> --token <t>` ile HTTP üzerinden. Kurallar, rol ve görünürlük
  iki yolda da aynı."
tags:
  - mcp
links:
  code:
    - file: src/mcp/server.ts
    - file: src/mcp/client.ts
verified_at_commit: da2b11a97658129d06087801ccfc2a5b7acf5b2f
id: 01M34QY9T47QSX4Q0GQ8V6GPEH
status: active
updated_by: ai-agent
updated_at: 2026-09-22T19:28:28.264Z
---

- Araçlar (`src/mcp/server.ts`) doğrudan çekirdeği değil `McpApi`yi çağırır (`src/mcp/client.ts`):
  - `localApi(cortex, actor)`: bellek içi Fastify; `projectRoutes` aynen çalışır, ağ yok, token yok.
  - `remoteApi(hub, project, token)`: `<hub>/api/p/<proje>/…` uçlarına `Authorization: Bearer` ile gider; ajanın rolü ve görünürlüğü uygulanır.
- Böylece tek kaynak var: REST'te düzelttiğin kural MCP'de de geçerli olur.
- Hatalar iki tarafta da kod, mesaj ve ipucuyla döner (`setErrorHandler`); yetki reddi `hint.needs` ile hangi yetkinin eksik olduğunu söyler.
- MCP yolunda asla `console.log` kullanılmaz: stdout protokole aittir (stderr kullan).
- `test/interfaces.test.ts` araç listesini, `test/hub.test.ts` merkez üzerinden MCP'yi (rol reddi dahil) kontrol eder.
