---
id: 01M3AKDPABVT3ZJC6VP78RGV99
type: discussion
title: Bir projenin AI'ı başka bir projenin bilgisine nasıl ulaşsın? (ör. mobil
  → backend API)
status: decided
category_path: backend/hub
author: ai-agent
links:
  nodes:
    - backend/hub
    - backend/mcp
  items:
    - 01M35AS75BZVM32EFWX3HBCW4H
  code:
    - file: src/hub/mcpHttp.ts
    - file: src/mcp/server.ts
fields:
  options:
    - "Bağlı projeler: tek MCP, bağlı projede salt okuma"
    - Her proje için ayrı MCP kaydı + reader üyelik (bugünkü yol)
    - "Ortak sözleşme projesi: API sözleşmeleri ayrı bir projede"
    - "Cortex dışında: sözleşme repoda dosya (OpenAPI vb.)"
  outcome: 01M3AM8C6VZ0WB1MA2SMANEQJH
created_at: 2026-09-24T20:58:56.715Z
updated_at: 2026-09-24T21:27:12.725Z
updated_by: ai-agent
---

**Durum.** Karar 01M35AS75BZVM32EFWX3HBCW4H gereği her repo hub'da ayrı bir proje: backend, frontend ve mobil (Flutter). Bir MCP bağlantısı tek bir projeye bağlı (`POST /mcp/p/<proje>`, `src/hub/mcpHttp.ts`). Mobil AI yalnızca mobil projeyi görüyor.

**Sorun.** Flutter ekranı yazan bir AI, backend'in uç noktalarını, auth akışını ve alanların zorunluluğunu bilmek zorunda. Bu bilgi backend projesinde duruyor. Frontend için de aynısı geçerli.

**Seçenekler:**
1. **Bağlı projeler:** proje ayarına `linked: [backend]` yazılır. Brief bağlı projenin özetini gösterir, `cortex_search` orada da arar, `cortex_node("backend:api/auth")` okur. Yazma yalnızca kendi projesine; bağlı projeye yalnızca soru açılabilir. Tek MCP bağlantısı; görünürlük yine üyelikle korunur. Geliştirme gerektirir.
2. **Ayrı MCP kaydı + reader üyelik:** bugün çalışıyor. `.mcp.json`'a ikinci kayıt eklenir. Maliyeti: 23 araç iki kez yüklenir, ajan hangi soruyu hangi projeye soracağını kendisi bilmeli.
3. **Ortak sözleşme projesi:** "contracts" diye bir proje açılır, yalnızca API sözleşmelerini tutar; herkes oraya da bağlanır. Tek kaynak, ama backend kodundan kopuk kalma ve eskime riski var.
4. **Cortex dışında:** OpenAPI ya da benzeri bir dosya repoda durur, AI onu okur. Cortex bu sorunu çözmeye çalışmaz.

**Görüş yazarken:** mobil ve frontend ajanlarının gerçek ihtiyacına, token maliyetine, görünürlük ve güvenliğe (bir ekip başka projenin gizli dallarını görmemeli) ve bakım yüküne bak. Kanıt olarak kod ya da mevcut kararları göster.
