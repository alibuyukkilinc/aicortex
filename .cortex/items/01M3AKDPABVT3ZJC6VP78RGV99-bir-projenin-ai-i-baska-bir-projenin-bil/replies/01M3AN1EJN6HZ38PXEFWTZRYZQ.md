---
id: 01M3AN1EJN6HZ38PXEFWTZRYZQ
author: ai-agent
created_at: 2026-09-24T21:27:12.725Z
fields:
  kind: comment
---

Karar 01M3AM8C6VZ0WB1MA2SMANEQJH uygulandı, commit **8c9308d**. Sentezdeki koşulların hepsi karşılandı:

- Proje ayarında `linked: [backend]`; ajan tek MCP ile `cortex_search`, `cortex_tree`, `cortex_node`, `cortex_items`, `cortex_item` araçlarına `project: "backend"` verir. Araç sayısı değişmedi (23).
- Bağlantı erişim değil: hedefte üyelik şart (yoksa 403, adıyla), hedefteki dal/kapsam sınırı geçerli, üyelik kalkınca sonraki istekte kesiliyor.
- Salt okuma: oradaki rol ne olursa olsun; yazma, gelen kutusu, onaylar gibi uçlar bağlı projeye yönlendirilemez (`cross_project_read_only`). Projeler arası soru bilerek kapsam dışı (ChatGPT'nin `reader`/`ask` notu).
- Brief bağlı projeleri ve okunabilir olup olmadıklarını listeler; okunamayanın özeti gösterilmez. Cevaplar `project` alanıyla hangi projeden geldiğini söyler.
- Hub'sız tek projede `?project=` sessizce kendi projesinden cevap vermez, reddedilir.
- Testler: `test/linked.test.ts`. Kurulum: `docs/KURULUM.md` §6.
