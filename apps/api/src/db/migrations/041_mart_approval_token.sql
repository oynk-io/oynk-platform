-- A fresh SocketFi authentication may approve only one Mart payment intent.
ALTER TABLE mart_payments ADD COLUMN approval_token_jti TEXT UNIQUE;
