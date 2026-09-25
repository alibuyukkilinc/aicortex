---
id: 01M3AKKY9WGJ4W0ZGJ2DGD1VYQ
author: chatgpt
created_at: 2026-09-24T21:02:21.501Z
fields:
  kind: opinion
  stance: "Bağlı projeler: tek MCP, bağlı projede salt okuma"
  confidence: high
  evidence:
    - 01M35AS75BZVM32EFWX3HBCW4H
    - src/hub/mcpHttp.ts:10-18
    - src/hub/server.ts:335-347
    - src/hub/access.ts:10-45
    - src/hub/roles.ts:14-21
    - src/api/routes.ts:122-144
---

Ürün yönü olarak bağlı projeleri destekliyorum. Mobilin backend sözleşmesini kaynağından okuyabilmesi, repo başına ayrı proje kararını bozmadan sağlanmalı. Kabul edilmiş 01M35AS75BZVM32EFWX3HBCW4H kararı diğer projelere otomatik erişim vermiyor; bağlantı tanımı da erişim izni yerine geçmemeli.

Mevcut MCP ucu proje kimliğine bağlı (mcpHttp.ts:10-18). Hedef projenin üyeliğini ve rolünü denetleyen API yolu var (hub/server.ts:335-347); dal ve kayıt görünürlüğü ayrıca hesaplanıyor (hub/access.ts:10-45). Yeni yönlendirme bu denetimleri aynı ajan kimliğiyle tekrar kullanmalı. Kaynak projedeki contributor rolü hedef projeye taşınmamalı; hedefteki yetki daha geniş olsa bile bağlı okuma kanalı salt okumayla sınırlandırılmalı.

İlk sürüm önerim: brief yalnızca erişilebilir bağlı projelerin kısa listesini sunsun; arama ve düğüm okuma açık bir project parametresiyle hedeflensin. Varsayılan arama mevcut projede kalsın; tüm bağlı projelerde arama isteğe bağlı ve tek toplam sonuç/token bütçeli olsun. Her sonuç proje kimliği, düğüm yolu ve eskime bilgisi taşısın. Böylece aynı adlı düğümler karışmaz, her istekte tüm proje özetleri yüklenmez. Tek araç takımının bağlamı azaltma potansiyeli var; kesin token kazancını ölçmeden sayı vermiyorum.

Önemli ayrıntı: seçenek açıklamasındaki 'bağlı projeye soru açılabilir' bugün reader rolüyle mümkün değil; reader yalnızca read taşıyor, ask ayrı izin (roles.ts:14-21). İlk kapsamı gerçekten salt okuma tutalım. Projeler arası soru yönlendirmesini ayrıca, hedef projenin açık ask izniyle ele alalım; sırf soru sorabilsin diye contributor vermeyelim.

Kabul ölçütleri: hedefte üye olmayan ajan hiçbir içerik alamamalı; üyelik iptali sonraki istekte etkili olmalı; gizli düğümler arama/özet/sayaçlar üzerinden görünmemeli; kaynak projede geniş yetkisi olan ajan hedefteki dar görünürlüğü aşamamalı. Mevcut görünürlükte üst düğümlerin ve kişinin kendi kayıtlarının özel kuralları var (access.ts:16-17); bunlar da hedef izinleri açısından sınanmalı.

Maliyet yeni yönlendirme, birleşik sonuç bütçesi ve erişim testleri. Bu geliştirilene kadar ayrı MCP + backend reader üyeliği geçiş yolu olabilir. Ortak sözleşme projesini zorunlu tutmayı önermiyorum; sözleşmenin backend koduna bağlı kalması mevcut repo başına bilgi ilkesiyle daha uyumlu.
