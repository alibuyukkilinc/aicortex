---
id: 01M35ARK6RZKN6J82MHYMR3WSG
author: chatgpt
created_at: 2026-09-22T19:51:24.632Z
status_change:
  from: open
  to: in_progress
---

Öneri: mobil kod için mevcut hub üzerinde ayrı bir Cortex projesi açalım. Bu projedeki mobile dalını kullanmayalım: kod ayrı repoda; kabul edilmiş karar gereği her projenin .cortex bilgisi kendi reposunda sürümlenir. Hub yalnızca kimlikleri, üyelikleri ve proje yollarını tutar.

Kurulum sırası (yetkili insan uygular):
1. Mobil reponun bir kopyasını hub sunucusunda erişilebilir bir klasöre koyun. Node 22.16+ gerekir. Mobil repo klasöründe `aicortex init --lang tr --branches mobile --agent-files` çalıştırın; mevcut .cortex varsa yeniden başlatmayın. İhtiyaç duyulan diğer dallar sonradan belirlenir.
2. Mevcut merkezi kullanın. Merkez henüz yoksa `aicortex hub init --org <kurum> --admin-email <e-posta> --admin-name <ad> --public-url <https-adresi>` ile oluşturun, çıkan bağlantıyla yönetici şifresini belirleyin. Ağa erişim gerekiyorsa HTTPS ters vekil arkasında `aicortex hub start --host 0.0.0.0` çalıştırın. `aicortex start` tek proje/localhost yolu ekip erişimi için seçilmez.
3. `aicortex hub add-project <mobil-repo-klasörü>` ile repoyu kaydedin; oluşan proje kimliğini kullanın. CLI belgesinde `--init` seçeneği de var; dili açık seçmek için başlatmayı ilk adımda yaptık.
4. Üç kişiyi merkezde tanımlayın/davet edin ve mobil projeye üye yapın. Belgelenmiş davet komutu `aicortex hub invite <e-posta>`; kişi oluşturma ve üyelik ekranlarının tam adları belgede yok, aşağıdaki soruda doğrulama istendi. İnsanlar tarayıcıdan kendi hesaplarıyla girsin.
5. Mobil projenin sorumlusu olan bir insana owner (Sahip), diğer iki kişiye member (Üye) öneriyorum. Bu, onay ve kural sorumluluğunu bir insanda toplar; sırf katılım için organizasyon yöneticiliği gerekmez. Bu seçim bir öneridir; kişi isimleri verilmedi.
6. Ekibin AI ajanını ayrı bir kimlikle kaydedin, token üretin ve yalnızca mobil projeye contributor (Katkıcı) olarak üye yapın. Okumanın yanında katkı istendiği için reader yerine contributor; onay istisnası gerektiren trusted için ihtiyaç gösterilmedi. AI hiçbir rolde kural/onay/üye yönetimini üstlenmemeli.
7. Dört üyeliğin görünürlüğünü mobil proje içinde 'her şeyi' ve dal kısıtı olmadan ayarlayın. Ortak kararları ve diğer kişilerin işlerini okuyabilsinler; 'yalnızca kendi kayıtları' ekip bağlamını daraltır. Ayrı proje sınırı yeterli olduğundan mobile dalına ayrıca daraltmayın. Bu Cortex projesine veya diğer projelere otomatik üyelik vermeyin; gerekirse ayrıca sınırlı erişim değerlendirin.
8. Belgelenmiş ajan bağlantısı `aicortex mcp --hub <url> --project <mobil-proje-id> --token <ajan-tokenı>` biçimindedir. İlk oturumda cortex_brief, sonra cortex_inbox kullanın; doğru proje/kimlik ve görünürlüğü kontrol edin. Güncel HTTP MCP adresi belgelenmediği için bir URL uydurmuyorum.

Dikkat: Proje .cortex verisi kendi reposunda kalır; ~/.cortex/hub içindeki hesap/oturum verisini ve tokenları git'e koymayın. Ağa açık merkez için HTTPS kullanın. backend/hub eski işaretli: bağlantı, ekran adımları ve kesin yetki matrisi uygulamadan önce owner tarafından doğrulanmalı. Bu eksikler için 01M35AQFZSWJM0Q4BEYJZP1JRD sorusunu açtım; mimari öneriyi engellemiyor, kurulumun doğrulandığı anlamına gelmiyor.

Dayanaklar: backend/cli; backend/hub (güncellik çekincesiyle); kabul edilmiş kararlar 01M34ZBN9VPACF7PGFBFEBY77W, 01M34ZBNA8Y6081XZFMEFA22BR ve 01M34ZBNAFBYKT1JY7J9MQW99M.
