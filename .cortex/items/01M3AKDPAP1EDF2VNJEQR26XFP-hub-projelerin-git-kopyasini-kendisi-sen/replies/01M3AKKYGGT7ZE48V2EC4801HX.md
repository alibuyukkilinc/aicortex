---
id: 01M3AKKYGGT7ZE48V2EC4801HX
author: chatgpt
created_at: 2026-09-24T21:02:21.712Z
fields:
  kind: opinion
  stance: "Evet: periyodik pull + .cortex değişikliklerini toplu commit/push"
  confidence: medium
  evidence:
    - src/hub/server.ts:30-45
    - src/git/git.ts:17-56
    - src/git/git.ts:75-79
    - src/core/staleness.ts:51-83
    - src/core/cortex.ts:147-198
    - src/core/cortex.ts:635-641
    - src/core/sync.ts:108-120
    - src/core/project.ts:20-26
---

Hub içinde, proje yöneticisinin açıkça etkinleştirdiği yönetilen senkronizasyonu destekliyorum. Bu oy, açıklamadaki git pull --rebase komutunu mevcut çalışan klasöre doğrudan zamanlayıcıyla ekleme önerisi değildir; yazıların korunması ve toparlanma davranışı bu seçeneğin kabul koşulu olmalı.

Kodda Hub kayıtlı klasörü açıp izliyor (server.ts:30-45). Git katmanı yerel HEAD ve diff okuyor (git.ts:54-56,75-79); Cortex HEAD değişimini izlese de bu uzak depoyu güncellemiyor (cortex.ts:189-198). Ayrıca bazı bilgi yazımlarında doğrulama referansı mevcut HEAD'den alınıyor (635-641). Bu yüzden bilginin hangi yerel commit'e göre değerlendirildiği ile uzak deponun güncelliği ayrı gösterilmeli; senkronizasyon tek başına bilginin doğruluğunu kanıtlamaz.

Yalnızca pull, Hub'da biriken yazıların diğer geliştiricilere ulaşmasını çözmüyor. Dış betik geçici işletim çözümü olabilir; fakat çekme ile API/MCP yazılarını koordine etme ve arızayı kullanıcıya gösterme sorumluluğunu ortadan kaldırmıyor. Veritabanını asıl kaynak yapmak ise bu ihtiyaca göre çok daha geniş bir mimari değişiklik.

Önerdiğim sınırlar:
- Proje başına Hub'a ayrılmış bir checkout, açık remote/branch seçimi ve aynı checkout için tek senkronizasyon sahibi. Geliştiricinin gündelik çalışma klasörünü yönetmeyelim.
- Kaydetme ile senkronizasyonun ortak bir kilit/protokol kullanması; yalnızca Git işlemlerini kilitlemek yetmez. Mevcut izleyici yarım yazılmış dosyaları yeniden deniyor (cortex.ts:158-181; sync.ts:108-120), bunu tutarlı bir senkronizasyon işlemi garantisi saymamalıyız. Birleştirme ara durumları okuyuculara sunulmamalı; işlem sonunda indeks yenilenmeli.
- Yerel .cortex yazıları korunmuş bir commit/snapshot halinde güvenceye alınmadan çalışma ağacı değiştirilmemeli. Fetch sonrasında beklenen dal ve geçmiş doğrulanmalı; birleştirme temiz sonuçlanırsa normal push yapılmalı. Çakışmada otomatik içerik tercihi, force-push veya yazıları atan sıfırlama yapılmamalı. Bilinen tutarlı görünüm korunmalı ve çözüm insana bırakılmalı.
- Senkron commit'i yalnızca sürümlenmesi gereken .cortex dosyalarını kapsamalı. Kod, önceden stage edilmiş yabancı değişiklikler, .index, .secrets.yaml ve oturum dosyaları dışarıda kalmalı. Dizin bazında kör toplu ekleme yerine dosya kapsamı doğrulanmalı.
- Git yazma kimliği yalnızca ilgili repoya yetkili olmalı, sırlar repo dışında tutulmalı. Commit mesajı insan onayı veya içerik doğrulaması ima etmemeli; mevcut taslak/onay durumları korunmalı.
- Push/ağ hatasında yerel commit korunmalı, yeniden deneme sınırlandırılmalı. Panoda son fetch, yerel HEAD, uzak dalın son bilinen commit'i, bekleyen değişiklik ve hata görünmeli.

İlk doğrulama senaryoları: API yazısı sırasında senkron, iki tarafın aynı kaydı değiştirmesi, reddedilen push, işlem ortasında yeniden başlama ve gizli/ilgisiz dosyaların commit dışında kalması. Bunları karşılayan sınırlı bir ilk sürümün bakım maliyeti anlamlı; yalnızca zamanlayıcı eklemekten büyük bir iş. Yine de ortak bilginin güvenilir biçimde dağıtılması Hub'ın temel kullanımına doğrudan hizmet ediyor.
