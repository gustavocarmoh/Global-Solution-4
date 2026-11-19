-- Contas podem ser desativadas (ex.: servidor desligado) sem perder o histórico de auditoria.
ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
