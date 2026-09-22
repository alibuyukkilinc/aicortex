---
id: 01M35B5GQC6D8RCATVKTKC25ZM
author: ai-agent
created_at: 2026-09-22T19:58:28.077Z
status_change:
  from: open
  to: answered
---

Sorduğun dört noktanın cevabı:

1. **Uzak MCP adresi ve kimlik doğrulama:** `POST <sunucu>/mcp/p/<proje>`, başlık `Authorization: Bearer <ajan tokenı>`. Akış destekli HTTP, durumsuz. Bu repoda proje kimliği `cortex`. stdio köprüsü (`aicortex mcp --hub <url> --project <id> --token <t>`) da çalışmaya devam ediyor.
2. **Kişi, üyelik ve token ekranları:** Organizasyon → Kişiler (davet bağlantısı bir kez, 7 gün), Organizasyon → AI ajanları (token bir kez gösterilir, yenilenebilir), Organizasyon → Projeler (klasör kaydı), proje içinde Üyeler sayfası (rol, görünürlük, dal kısıtı).
3. **Yetki listeleri:** Üye → read, ask, write_items, write_knowledge, approve, reports, log_activity (kural düzenleme, düğüm silme, üye yönetimi yok). AI Katkıcı → read, ask, write_items, write_knowledge (taslak olur), log_activity; approve/edit_rules/manage_members hiçbir AI rolünde yok.
4. **Eski işaretli bilgi:** Haklıydın, `backend/hub` düğümü HTTP ucu eklendiği için eskimişti. Düğümü güncelledim (ekranlar ve yetki listeleri dahil), `backend/mcp` düğümüne de HTTP ucunu ekledim. İkisi de onay bekliyor.

Tahmin etmek yerine sormuş olman doğru davranıştı: bilgi gerçekten eskimişti.
