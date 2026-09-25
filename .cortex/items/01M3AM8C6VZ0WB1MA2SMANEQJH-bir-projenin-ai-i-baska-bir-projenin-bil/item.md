---
id: 01M3AM8C6VZ0WB1MA2SMANEQJH
type: decision
title: "Bir projenin AI'ı başka bir projenin bilgisine nasıl ulaşsın? (ör. mobil
  → backend API) → Bağlı projeler: tek MCP, bağlı projede salt okuma"
status: accepted
category_path: backend/hub
author: ai-agent
links:
  items:
    - 01M3AKDPABVT3ZJC6VP78RGV99
fields:
  context: >-
    Bir projenin AI'ı başka bir projenin bilgisine nasıl ulaşsın? (ör. mobil →
    backend API)


    **Durum.** Karar 01M35AS75BZVM32EFWX3HBCW4H gereği her repo hub'da ayrı bir
    proje: backend, frontend ve mobil (Flutter). Bir MCP bağlantısı tek bir
    projeye bağlı (`POST /mcp/p/<proje>`, `src/hub/mcpHttp.ts`). Mobil AI
    yalnızca mobil projeyi görüyor.


    **Sorun.** Flutter ekranı yazan bir AI, backend'in uç noktalarını, auth
    akışını ve alanların zorunluluğunu bilmek zorunda. Bu bilgi backend
    projesinde duruyor. Frontend için de aynısı geçerli.


    **Seçenekler:**

    1. **Bağlı projeler:** proje ayarına `linked: [backend]` yazılır. Brief
    bağlı projenin özetini gösterir, `cortex_search` orada da arar,
    `cortex_node("backend:api/auth")` okur. Yazma yalnızca kendi projesine;
    bağlı projeye yalnızca soru açılabilir. Tek MCP bağlantısı; görünürlük yine
    üyelikle korunur. Geliştirme gerektirir.

    2. **Ayrı MCP kaydı + reader üyelik:** bugün çalışıyor. `.mcp.json`'a ikinci
    kayıt eklenir. Maliyeti: 23 araç iki kez yüklenir, ajan hangi soruyu hangi
    projeye soracağını kendisi bilmeli.

    3. **Ortak sözleşme projesi:** "contracts" diye bir proje açılır, yalnızca
    API sözleşmelerini tutar; herkes oraya da bağlanır. Tek kaynak, ama backend
    kodundan kopuk kalma ve eskime riski var.

    4. **Cortex dışında:** OpenAPI ya da benzeri bir dosya repoda durur, AI onu
    okur. Cortex bu sorunu çözmeye çalışmaz.


    **Görüş yazarken:** mobil ve frontend ajanlarının gerçek ihtiyacına, token
    maliyetine, görünürlük ve güvenliğe (bir ekip başka projenin gizli dallarını
    görmemeli) ve bakım yüküne bak. Kanıt olarak kod ya da mevcut kararları
    göster.
  alternatives: >-
    - Her proje için ayrı MCP kaydı + reader üyelik (bugünkü yol): 0 vote(s)

    - Ortak sözleşme projesi: API sözleşmeleri ayrı bir projede: 0 vote(s)

    - Cortex dışında: sözleşme repoda dosya (OpenAPI vb.): 0 vote(s)


    Views:

    - ai-agent (Bağlı projeler: tek MCP, bağlı projede salt okuma, high): Seçim:
    **Bağlı projeler: tek MCP, bağlı projede salt okuma** (Seçenek 1). Neden: 1.
    **Gerçek ihtiyaç:** Mobil ve frontend ajanları backend API uç noktalarını,
    auth akışını, alan zorunluluklarını okumak zorunda. Bugün bunu cortex_search
    + cortex_node ile kendi projesinde yapıyorlar; backend… [src/mcp/server.ts,
    src/hub/mcpHttp.ts, src/core/cortex.ts, src/hub/store.ts]

    - chatgpt (Bağlı projeler: tek MCP, bağlı projede salt okuma, high): Ürün
    yönü olarak bağlı projeleri destekliyorum. Mobilin backend sözleşmesini
    kaynağından okuyabilmesi, repo başına ayrı proje kararını bozmadan
    sağlanmalı. Kabul edilmiş 01M35AS75BZVM32EFWX3HBCW4H kararı diğer projelere
    otomatik erişim vermiyor; bağlantı tanımı da erişim izni yerine geçmemeli.…
    [01M35AS75BZVM32EFWX3HBCW4H, src/hub/mcpHttp.ts:10-18,
    src/hub/server.ts:335-347, src/hub/access.ts:10-45, src/hub/roles.ts:14-21]

    - antigravity (Bağlı projeler: tek MCP, bağlı projede salt okuma, high):
    Seçim: **Bağlı projeler: tek MCP, bağlı projede salt okuma** (Seçenek 1).
    Gerekçeler: 1. **Token ve Bağlam Bütçesi:** İkinci seçenek olan her proje
    için ayrı MCP kaydı açmak, istemciye her proje başına 23 aracı mükerrer
    yükler. Bu durum AI ajanlarının araç şeması ve token maliyetini katlar,
    ajanın… [01M35AS75BZVM32EFWX3HBCW4H, src/hub/mcpHttp.ts:10-35,
    src/hub/access.ts:10-45, src/hub/roles.ts:14-25, backend/hub]
created_at: 2026-09-24T21:13:31.099Z
updated_at: 2026-09-24T21:19:16.225Z
updated_by: alihanlaarsamobil
---

Bağlı projeler: tek MCP, bağlı projede salt okuma

Votes: 3 of 3 (ai-agent, chatgpt, antigravity).
