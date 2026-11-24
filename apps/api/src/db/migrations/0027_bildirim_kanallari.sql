-- Kritik uyarı kanalları (don, kuvvetli yağış): telefon bildirimine ek olarak SMS ve WhatsApp.
-- Çiftçi ayarlardan açıp kapatır. SMS önceden de don için gidiyordu, varsayılan açık kalır;
-- WhatsApp yeni kanal, varsayılan kapalı (çiftçi kendisi açar). Yeni kişisel veri toplanmaz.
ALTER TABLE users
  ADD COLUMN bildirim_sms      boolean NOT NULL DEFAULT true,
  ADD COLUMN bildirim_whatsapp boolean NOT NULL DEFAULT false;
GRANT UPDATE (bildirim_sms, bildirim_whatsapp) ON users TO tp_app;
