---
title: Güvenlik modeli
summary: "Tek proje: yalnızca localhost, sahibine özel token'lar (0600), 10
  dakikalık imzalı giriş bağlantısı, özetle saklanan iptal edilebilir pano
  oturumu. Ekler yalnızca güvenli türlerde satır içi. Hub: scrypt şifre,
  httpOnly oturum, CSRF başlığı, her kapıda deneme sınırı; rol ve görünürlük."
links:
  code:
    - file: src/api/auth.ts
    - file: src/api/server.ts
      lines: 81-155
    - file: src/api/sessions.ts
    - file: src/core/project.ts
    - file: src/hub/server.ts
    - file: src/hub/limiter.ts
    - file: src/hub/crypto.ts
    - file: src/store/attachments.ts
verified_at_commit: b2ffcf3274cd981a82cd0839e44e5d900cde3a64
id: 01M34Q1CBF3AXG1Q0MKDJYKB6J
status: active
updated_by: ai-agent
updated_at: 2026-09-24T20:05:08.481Z
---

- `onRequest` kancası localhost/127.0.0.1/[::1] dışındaki her Host'u reddeder.
- Giriş kodu `<aktör>.<bitiş>.<imza>` aktörün kendi token'ıyla imzalanır: sunucuda durum tutmaz, token hiçbir zaman adres çubuğuna veya geçmişe düşmez.
- Pano oturumu (`src/api/sessions.ts`): `/login` rastgele bir oturum anahtarı verir; çerez API token'ı DEĞİLDİR. `.cortex/.sessions.json` yalnızca SHA-256 özetini tutar, 30 gün geçerli, 0600, git'e girmez. `/api/logout` oturumu siler; `cortexboard logout [--actor] [--all]` çalışan sunucudaki oturumları da bitirir.
- Geçiş: ham token taşıyan eski çerez bir kez kabul edilip yeni oturumla değiştirilir (aynı anda gelen istekler aynı oturumu alır); yalnızca insan aktörler. 0.2.x sonrası kaldırılacak.
- Bearer yolu (AI'lar, betikler) değişmedi. `loadTokens` değişim zamanı+boyutla önbellekler; karşılaştırma SHA-256 özetleri üzerinde `timingSafeEqual` ile, erken çıkmadan tüm girdilere bakar.
- `.secrets.yaml` `init`'te 0600 yazılır; POSIX'te daha gevşek izinli eski dosya ilk okumada 0600'a çekilir.
- Çerezle yapılan yazımlar `x-cortex-csrf: 1` başlığı ister; CORS hiç açılmaz.
- Aktör adları dosya adı olarak kullanıldığı için denetlenir.
- **Ekler** (`GET /items/:id/files/:name`): tür uzantıdan belirlenir, `X-Content-Type-Options: nosniff` ve `Content-Security-Policy: sandbox; default-src 'none'` ile sunulur. Yalnızca güvenli resimler (png/jpeg/gif/webp/avif/bmp/ico) ve metin satır içi; SVG, HTML ve PDF her zaman indirme (sayfada kod çalıştırabilirler). Dosya adı tek bir güvenli yol parçasına çevrilir; zaten güvenli olmayan ad (`../item.md`, ters bölü) hiç çözülmez, 404. Dosya başına 15 MB, kalem başına 100. Panoda Markdown DOMPurify'dan geçer; `blob:` adreslerine yalnızca henüz yüklenmemiş ekleri gösterirken izin verilir.
## Hub
- Şifreler scrypt ile özetlenir, en az 10 karakter; davet ve oturum tokenları yalnızca SHA-256 özetiyle saklanır. Davet 48 saat geçerli, tek kullanımlık.
- Oturum çerezi httpOnly, SameSite=Lax. Secure: `hub.yaml` → `cookie_secure` verilmişse o; verilmemişse hub yalnızca loopback'te dinlemiyorsa açık. `trust_proxy: true` iken `X-Forwarded-Proto: https` de Secure yapar. Çerezle yazımlar `x-cortex-csrf` ister.
- Deneme sınırı (`src/hub/limiter.ts`, 15 dakika): adres+e-posta başına 10 hatalı şifre; adres başına 10 hatalı ajan token'ı (REST ve MCP birlikte); adres başına 20 geçersiz davet bağlantısı. Bellek üst sınırlı.
- `allowed_hosts` tanımlıysa listenin kendisidir: localhost için gizli istisna yok.
- İnternete açılacaksa HTTPS arkasında çalıştırılmalı; `hub start` ağa açıkken HTTPS yoksa uyarır.
- **Güven sınırı — hub'ın dosyaları:** `~/.cortex/hub` klasörünü okuyabilen kişi zaten şifre özetlerini ve token özetlerini görür, yani hub'ın sahibidir. `cortexboard hub member <proje> <kim>` bu yüzden ayrı bir yetki istemez: üyelik verme API'de insanlara ayrılmıştır (hiçbir AI rolü `manage_members` taşımaz), terminaldeki komut ise makinenin sahibinin elindedir. Uzaktan bağlanan bir ajan bu komutu çalıştıramaz; yalnızca dosyalara erişen çalıştırabilir.
- Üyeliği olmayan bir istek 403 alır ve mesaj iki tarafı da yazar (`opencode is not a member of "arsa-back"`), çünkü bir ajanın hatası çoğu zaman başka birinin günlüğünde okunur. Geçerli token + eksik üyelik ile geçersiz token birbirine karışmasın diye ayrı kodlar: `unauthorized` ve `forbidden`.
- Güvenlik bildirimi: `SECURITY.md` (GitHub özel açık bildirimi).
- Henüz yok: SSO, iki adımlı doğrulama, e-postayla davet gönderimi.
