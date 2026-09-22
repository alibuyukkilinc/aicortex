---
title: MCP sunucusu
summary: "`aicortex mcp` stdio üzerinden 18 araç sunar; merkezde ayrıca HTTP ucu
  vardır (POST /mcp/p/<proje>, Bearer token). Araçlar proje REST API'sini
  konuşur: yerelde süreç içinde, merkezde HTTP ile. Kurallar, rol ve görünürlük
  her yolda aynı."
tags:
  - mcp
links:
  code:
    - file: src/mcp/server.ts
    - file: src/mcp/client.ts
    - file: src/hub/mcpHttp.ts
verified_at_commit: be22b1b2f35a515bc8d75a0587acf061c5da8034
id: 01M34QY9T47QSX4Q0GQ8V6GPEH
status: active
updated_by: ai-agent
updated_at: 2026-09-22T20:09:01.378Z
---

- Araçlar (`src/mcp/server.ts`) doğrudan çekirdeği değil `McpApi`yi çağırır (`src/mcp/client.ts`):
  - `localApi(cortex, actor)`: bellek içi Fastify; `projectRoutes` aynen çalışır, ağ yok, token yok.
  - `remoteApi(hub, project, token)`: `<hub>/api/p/<proje>/…` uçlarına `Authorization: Bearer` ile gider; ajanın rolü ve görünürlüğü uygulanır.
- HTTP ucu (`src/hub/mcpHttp.ts`): `POST /mcp/p/<proje>`, durumsuz; her istek için yeni sunucu ve taşıyıcı açılır, çağrı `app.inject` ile aynı proje rotalarına gider. Bu bilgisayarda çalışmayan AI'lar (ChatGPT gibi) böyle bağlanır.
- Böylece tek kaynak var: REST'te düzelttiğin kural MCP'de de geçerli olur.
- Hatalar iki tarafta da kod, mesaj ve ipucuyla döner (`setErrorHandler`); yetki reddi `hint.needs` ile hangi yetkinin eksik olduğunu söyler.
- MCP yolunda asla `console.log` kullanılmaz: stdout protokole aittir (stderr kullan).
- `test/interfaces.test.ts` araç listesini, `test/hub.test.ts` merkez üzerinden MCP'yi (rol reddi dahil) kontrol eder.
