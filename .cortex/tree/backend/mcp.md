---
title: MCP sunucusu
summary: "`aicortex mcp` stdio üzerinden 19 araç sunar (en yenisi
  `cortex_claim`: görev devri); merkezde ayrıca HTTP ucu vardır (POST
  /mcp/p/&lt;proje&gt;, Bearer token). Araçlar proje REST API'sini konuşur:
  yerelde süreç içinde, merkezde HTTP ile. Kurallar, rol ve görünürlük her yolda
  aynı."
links:
  code:
    - file: src/mcp/server.ts
    - file: src/mcp/client.ts
    - file: src/hub/mcpHttp.ts
verified_at_commit: e047112b0fd3eb0ad9a2607ed9b3c2553c72506e
id: 01M34QY9T47QSX4Q0GQ8V6GPEH
status: active
updated_by: ai-agent
updated_at: 2026-09-22T23:09:51.821Z
---

- Araçlar (`src/mcp/server.ts`) doğrudan çekirdeği değil `McpApi`yi çağırır (`src/mcp/client.ts`):
  - `localApi(cortex, actor)`: bellek içi Fastify; `projectRoutes` aynen çalışır, ağ yok, token yok.
  - `remoteApi(hub, project, token)`: `<hub>/api/p/<proje>/…` uçlarına `Authorization: Bearer` ile gider; ajanın rolü ve görünürlüğü uygulanır.
- HTTP ucu (`src/hub/mcpHttp.ts`): `POST /mcp/p/<proje>`, durumsuz; her istek için yeni sunucu ve taşıyıcı açılır, çağrı `app.inject` ile aynı proje rotalarına gider. Bu bilgisayarda çalışmayan AI'lar (ChatGPT gibi) böyle bağlanır.
- Böylece tek kaynak var: REST'te düzelttiğin kural MCP'de de geçerli olur.
- Hatalar iki tarafta da kod, mesaj ve ipucuyla döner (`setErrorHandler`); yetki reddi `hint.needs` ile hangi yetkinin eksik olduğunu söyler.
- MCP yolunda asla `console.log` kullanılmaz: stdout protokole aittir (stderr kullan).
- `cortex_claim` (`action: "claim"|"release"`): bir AI'nin bir görevi şu an fiilen üstlendiğini/bıraktığını söylemesi, başka bir ajanın çakışmaması için. `cortex_update_item`'a da isteğe bağlı `if_rev` eklendi (eşzamanlılık koruması). Ayrıntı: `backend/items-and-rules`.
- `test/interfaces.test.ts` araç listesini, `test/hub.test.ts` merkez üzerinden MCP'yi (rol reddi dahil) kontrol eder.
