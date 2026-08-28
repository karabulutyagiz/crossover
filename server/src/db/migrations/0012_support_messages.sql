-- Hedefli destek/duyuru mesajları: belirli kullanıcılara tek seferlik popup.
-- Kullanıcı bağlanınca (register/auth/guest) seen=false olanlar gönderilir;
-- istemci popup'ı gösterip ack'leyince seen=true olur (bir daha çıkmaz).
CREATE TABLE IF NOT EXISTS support_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       text NOT NULL,
  title      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  seen       boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_support_messages_pending
  ON support_messages (user_id) WHERE seen = false;
