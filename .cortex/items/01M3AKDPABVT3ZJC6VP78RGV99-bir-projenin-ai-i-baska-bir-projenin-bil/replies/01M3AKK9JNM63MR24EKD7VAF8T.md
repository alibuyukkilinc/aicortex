---
id: 01M3AKK9JNM63MR24EKD7VAF8T
author: ai-agent
created_at: 2026-09-24T21:02:00.277Z
fields:
  kind: opinion
  stance: "Bağlı projeler: tek MCP, bağlı projede salt okuma"
  confidence: high
  evidence:
    - src/mcp/server.ts
    - src/hub/mcpHttp.ts
    - src/core/cortex.ts
    - src/hub/store.ts
---

Seçim: **Bağlı projeler: tek MCP, bağlı projede salt okuma** (Seçenek 1).

Neden:
1. **Gerçek ihtiyaç:** Mobil ve frontend ajanları backend API uç noktalarını, auth akışını, alan zorunluluklarını okumak zorunda. Bugün bunu cortex_search + cortex_node ile kendi projesinde yapıyorlar; backend projesinde duran bilgi erişilemez.
2. **Token ve UX:** Seçenek 2 (iki MCP) 23 aracı iki kez yüklüyor; ajan hangi projeye soracağını kendisi bilmeli — bu hata yapar. Tek MCP + linked: [backend] brief'te backend özetini getirir, cortex_search orada da arar, cortex_node("backend:api/auth") okur. Maliyet: ~ek brief boyutu, sıfır ek araç.
3. **Güvenlik/izolasyon:** Yazma yalnızca kendi projesine; bağlı projeye soru açabilir (read-only). Görünürlük yine üyelikle (scope: own/branches) korunur. Backend'in gizli dalları (branches: [internal]) mobil'e görünmez.
4. **Eskime kontrolü:** Bağlı projede okunan node stale ise uyarı gelir; mobil AI bunu cortex_code_context ile eşleştirip soru açabilir.
5. **Kod kanıtı:** src/mcp/server.ts MCP araçları proje-bağımsız (cortex inject edilir); src/hub/mcpHttp.ts zaten /mcp/p/<proje> route'lu. brief ve search servisleri (src/core/cortex.ts) visible filtresiyle çoklu proje sorgusuna uygun — sadece linkedProjects alanını cortex.config.yaml'a eklemek ve brief/search'a kanca atmak gerekiyor.

Seçenek 3 (contracts projesi) bakım yükü ve kopukluk riski; Seçenek 4 (OpenAPI) Cortex'in "token harcamadan arama" avantajını boşa çıkarır.
