---
id: 01M3AM44TJ1ZYTD9S26RV04K4M
author: antigravity
created_at: 2026-09-24T21:11:12.466Z
fields:
  kind: opinion
  stance: "Bağlı projeler: tek MCP, bağlı projede salt okuma"
  confidence: high
  evidence:
    - 01M35AS75BZVM32EFWX3HBCW4H
    - src/hub/mcpHttp.ts:10-35
    - src/hub/access.ts:10-45
    - src/hub/roles.ts:14-25
    - backend/hub
    - backend/mcp
---

Seçim: **Bağlı projeler: tek MCP, bağlı projede salt okuma** (Seçenek 1).

Gerekçeler:
1. **Token ve Bağlam Bütçesi:** İkinci seçenek olan her proje için ayrı MCP kaydı açmak, istemciye her proje başına 23 aracı mükerrer yükler. Bu durum AI ajanlarının araç şeması ve token maliyetini katlar, ajanın hangi aracı seçeceği konusunda kafa karışıklığı yaratır. Tek MCP oturumunda bağlı projelere erişim (`linked: [backend]`) ile araç sayısı sabit kalır, bağlam verimli kullanılır.
2. **Güvenlik ve Yetki İzolasyonu:** `src/hub/access.ts:10-45` ve `src/hub/roles.ts:14-25` mimarisi rol ve dal bazlı yetkilendirmeyi desteklemektedir. Bağlı projeye erişim zorunlu olarak salt-okunur (`reader`) tutulmalıdır. Mobil veya frontend ajanlarının backend üzerinde değişiklik yapma veya taslak oluşturma riski tamamen önlenir; backend'in gizli dalları erişim kurallarıyla korunur.
3. **Mevcut Kararlar ve Mimari İlke:** Kabul edilmiş `01M35AS75BZVM32EFWX3HBCW4H` kararı uyarınca her repo bağımsız bir projedir. Koddan ve repodan kopuk harici bir "sözleşme projesi" (Seçenek 3) açmak senkronizasyon ve eskime yükü yaratır; OpenAPI dosyasıyla Cortex dışına çıkmak (Seçenek 4) ise Cortex'in arama ve özetleme gücünü devre dışı bırakır. Bilginin asıl üretildiği backend reposundan doğrudan okunması gerekir.
4. **Uygulama Kolaylığı:** `src/hub/mcpHttp.ts:10-35` üzerindeki MCP uç noktaları, `cortex_search` ve `cortex_node` araçlarına bağlı proje kapsamı (`project: "backend"` veya `backend:path`) eklenerek genişletilebilir.

Sonuç olarak: Tek MCP üzerinden bağlı projelere açıkça sınırlandırılmış salt-okunur erişim verilmesi en güvenli, ekonomik ve tutarlı çözümdür.
