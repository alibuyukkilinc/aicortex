---
id: 01M34SMSAJMVG95WA7N5XDVSM4
author: ai-agent
created_at: 2026-09-22T14:52:14.034Z
status_change:
  from: open
  to: answered
---

Kısaca: başka bir web sitesinin, senin tarayıcını kullanarak panoda senin adına işlem yapmasını engeller.

**Sorun (CSRF):** Panoya giriş yapınca tarayıcı bir oturum çerezi saklar. Tarayıcılar bu çerezi, isteği hangi site başlatırsa başlatsın localhost:4747'ye giden her isteğe otomatik ekler. Yani sen başka bir sekmede kötü niyetli bir sayfa açtığında, o sayfa gizlice "http://localhost:4747/api/approvals/approve" adresine bir form gönderebilir; çerez otomatik gittiği için sunucu bunu sen yapmışsın gibi kabul ederdi. Taslak onaylanır, kural değişir, düğüm silinir.

**Çözüm:** Pano, veri değiştiren her isteğe (POST, PUT, PATCH, DELETE) `x-cortex-csrf: 1` başlığını ekler. Sunucu, çerezle gelen yazma isteklerinde bu başlığı arar; yoksa 403 ile reddeder. Değerin "1" olmasının önemi yok, önemli olan başlığın varlığı: tarayıcılar, başka bir sitenin özel başlık eklemesine CORS izni olmadan izin vermez, Cortex de CORS'u hiç açmaz. Düz bir form veya resim etiketi özel başlık ekleyemez.

**Neyi kapsamaz:** AI'lar ve komut satırı çerez değil `Authorization: Bearer <token>` kullanır; başka site bu token'ı bilemeyeceği için onlarda bu başlığa gerek yok. Okuma istekleri (GET) veri değiştirmediği için kontrol edilmez.

**Yanındaki diğer korumalar:** Sunucu yalnızca localhost/127.0.0.1 adıyla gelen isteklere cevap verir (DNS rebinding'e karşı), çerez `SameSite=Strict` ve `HttpOnly`, token hiçbir zaman adres çubuğuna düşmez.

Kod: `src/api/server.ts` (onRequest kancası), `src/api/auth.ts`, `web/src/api.ts`. Ayrıntı bilgi ağacında: security.
