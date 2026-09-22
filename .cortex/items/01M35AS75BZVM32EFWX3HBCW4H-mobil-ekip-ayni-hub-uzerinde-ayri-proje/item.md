---
id: 01M35AS75BZVM32EFWX3HBCW4H
type: decision
title: Mobil ekip aynı hub üzerinde ayrı proje olarak katılsın
status: proposed
category_path: backend/hub
author: chatgpt
links:
  nodes:
    - backend/hub
    - backend/cli
  items:
    - 01M35A202YF7D3HZWH8RQH97XS
    - 01M35AQFZSWJM0Q4BEYJZP1JRD
    - 01M34ZBN9VPACF7PGFBFEBY77W
    - 01M34ZBNA8Y6081XZFMEFA22BR
    - 01M34ZBNAFBYKT1JY7J9MQW99M
fields:
  context: Üç kişilik mobil ekip ve kendi AI ajanı katılacak; mobil kod ayrı
    repoda. Kabul edilmiş kararlar ekip için ortak hub, repo başına .cortex ve
    üyelik başına rol/görünürlük öngörüyor.
  alternatives: "Mevcut Cortex projesinde mobile dalı: ayrı mobil reponun
    bilgisini kodundan ayırır ve iki projenin erişim yönetimini aynı proje içine
    taşır. Her kişide yalnızca yerel proje: ortak ekip erişimini karşılamaz.
    Ayrı hub: mevcut ortak merkezin yanında ek yönetim yükü; ayrı merkez
    gereksinimi belirtilmedi. own veya yalnız mobile dalı görünürlüğü: proje
    içindeki ortak bağlamı gereksiz daraltır."
  consequences: Mobil bilgi koduyla birlikte sürümlenir ve proje üyelikleriyle
    ayrılır. Hub sunucusunda mobil repo kopyası, HTTPS ve insan tarafından
    üyelik/token kurulumu gerekir. Proje sorumlusu onay ve kuralları yönetir; AI
    contributor olarak katkı sunar. Eski işaretli hub düğümü nedeniyle güncel
    HTTP MCP, ekran adımları ve kesin yetki matrisi uygulama öncesi
    doğrulanmalıdır.
created_at: 2026-09-22T19:51:45.067Z
updated_at: 2026-09-22T19:51:45.067Z
updated_by: chatgpt
---

Mobil repo aynı hub'a ayrı proje olarak kaydedilsin; .cortex mobil repoda kalsın. Üç kişiden proje sorumlusu owner, diğer ikisi member; ayrı AI kimliği contributor olsun. Dört üyelik mobil projenin tamamını görsün, dal kısıtı olmasın; diğer projelere otomatik erişim verilmesin. Kurulum sırası ilgili issue yanıtındadır. Bu bir öneridir; kabul veya ret insana aittir. Güncel bağlantı ve yetki ayrıntıları 01M35AQFZSWJM0Q4BEYJZP1JRD sorusuyla doğrulanmalıdır.
