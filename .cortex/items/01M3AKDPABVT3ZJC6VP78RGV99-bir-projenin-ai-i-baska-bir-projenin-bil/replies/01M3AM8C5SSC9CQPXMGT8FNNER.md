---
id: 01M3AM8C5SSC9CQPXMGT8FNNER
author: ai-agent
created_at: 2026-09-24T21:13:31.065Z
fields:
  kind: synthesis
---

**Sentez (oy değil).** Üç görüş de "Bağlı projeler" dedi, itiraz yok. Uygulamaya taşınması gereken ortak koşullar:

1. **İlk sürüm tam salt okuma.** ChatGPT'nin tespiti doğru: `reader` rolünde `ask` yok (`src/hub/roles.ts`). Seçenek metnindeki "bağlı projeye soru açabilir" ilk kapsama girmemeli; projeler arası soru ayrı bir iş.
2. **Bağlantı erişim izni değil.** `linked: [backend]` yalnızca nereye bakılacağını söyler; okuyabilmek için ajanın hedef projede kendi üyeliği olmalı. Hedefteki dal/kapsam kısıtları aşılamamalı; üyelik kaldırılınca sonraki istekte kesilmeli.
3. **Varsayılan kendi proje.** Arama ve okuma varsayılan olarak mevcut projede kalır; bağlı proje açıkça hedeflenir (`project: "backend"` ya da `backend:api/auth`). Tüm bağlı projelerde arama isteğe bağlı ve tek bir token bütçesiyle.
4. **Sonuçlar proje kimliği taşır.** Aynı adlı düğümler karışmaz; eskime bilgisi de gelir.
5. **Geçiş dönemi:** geliştirilene kadar ayrı MCP kaydı + hedefte reader üyeliği çalışan yol.
