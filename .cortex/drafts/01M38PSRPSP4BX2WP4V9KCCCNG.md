---
kind: node
target: backend/mcp
proposed_by: ai-agent
reason: "Gözden geçirme: 20. araç cortex_item_file, binary çağrı seçeneği,
  log_activity cevabındaki eskime bildirimi ve yeni testler; eski metin 19 araç
  diyordu."
base_rev: 67c5f6ad
id: 01M38PSRPSP4BX2WP4V9KCCCNG
proposed_at: 2026-09-24T03:19:29.241Z
data:
  path: backend/mcp
  title: MCP sunucusu
  summary: "`aicortex mcp` stdio üzerinden 20 araç sunar (en yenisi
    `cortex_item_file`: ekleri okur, resmi resim olarak döndürür); merkezde
    ayrıca HTTP ucu vardır (POST /mcp/p/&lt;proje&gt;). Araçlar proje REST
    API'sini konuşur; kurallar, rol ve görünürlük her yolda aynı."
  links:
    code:
      - file: src/mcp/server.ts
      - file: src/mcp/client.ts
      - file: src/hub/mcpHttp.ts
  verified_at_commit: 3295916c724365d800427f9468950a5ad1f02895
  id: 01M34QY9T47QSX4Q0GQ8V6GPEH
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-24T03:19:29.232Z
---

- Araçlar (`src/mcp/server.ts`) doğrudan çekirdeği değil `McpApi`yi çağırır (`src/mcp/client.ts`):
  - `localApi(cortex, actor)`: bellek içi Fastify; `projectRoutes` aynen çalışır, ağ yok, token yok.
  - `remoteApi(hub, project, token)`: `<hub>/api/p/<proje>/…` uçlarına `Authorization: Bearer` ile gider; ajanın rolü ve görünürlüğü uygulanır.
  - `call(method, path, { query, body, text, binary })`: `binary` gövdeyi bayt olarak döndürür (ekler için); hub'daki HTTP köprüsü de aynısını destekler.
- HTTP ucu (`src/hub/mcpHttp.ts`): `POST /mcp/p/<proje>`, durumsuz; her istek için yeni sunucu ve taşıyıcı açılır, çağrı `app.inject` ile aynı proje rotalarına gider. Hatalı ajan token'ları adres başına sınırlanır (REST ile ortak sayaç).
- Böylece tek kaynak var: REST'te düzelttiğin kural MCP'de de geçerli olur.
- Hatalar iki tarafta da kod, mesaj ve ipucuyla döner (`setErrorHandler`); yetki reddi `hint.needs` ile hangi yetkinin eksik olduğunu söyler.
- MCP yolunda asla `console.log` kullanılmaz: stdout protokole aittir (stderr kullan). `test/cli.test.ts` bunu gerçek bir alt süreçle, her stdout satırını JSON-RPC olarak ayrıştırarak denetler.
- `cortex_item` kalemin eklerini `attachments` altında listeler. `cortex_item_file(id, name)`: Markdown ve metin metin olarak (100.000 karaktere kadar), güvenli resimler (≤4 MB) MCP `image` içeriği olarak döner — AI ekran görüntüsüne doğrudan bakabilir; diğer dosyalar yalnızca tanımlanır.
- `cortex_log_activity` cevabı, değişikliğin eskittiği düğümleri ve "bu turda kapat" ipucunu içerir (`backend/activity`).
- `cortex_claim` (`action: "claim"|"release"`) ve `cortex_update_item`'daki `if_rev`: görev devri ve eşzamanlılık. Ayrıntı: `backend/items-and-rules`.
- `test/interfaces.test.ts` araç listesini, `test/hub.test.ts` merkez üzerinden MCP'yi, `test/protocol.test.ts` §14 protokolünü uçtan uca, `test/attachments.test.ts` ek okumayı kontrol eder.
