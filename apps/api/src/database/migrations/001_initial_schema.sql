-- Extensões obrigatórias para UUID, PostGIS e similaridade textual (trigramas)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Enums
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('citizen', 'triage', 'department', 'manager', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE occurrence_status AS ENUM (
    'received',
    'in_review',
    'forwarded',
    'scheduled',
    'in_progress',
    'done',
    'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE occurrence_priority AS ENUM ('alta', 'media', 'baixa');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 1. departments
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(120) NOT NULL UNIQUE,
  response_deadline_days INT NOT NULL DEFAULT 3,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(140) NOT NULL,
  email VARCHAR(180) UNIQUE,
  phone VARCHAR(40),
  password_hash TEXT,
  role user_role NOT NULL DEFAULT 'citizen',
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  lgpd_consent_at TIMESTAMPTZ,
  text_size_pref VARCHAR(20) NOT NULL DEFAULT 'default',
  high_contrast_pref BOOLEAN NOT NULL DEFAULT FALSE,
  reduce_motion_pref BOOLEAN NOT NULL DEFAULT FALSE,
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  refresh_token_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. categories
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(60) NOT NULL,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  execution_deadline_days INT NOT NULL DEFAULT 7,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. occurrence_groups (criada antes ou com FK diferida para occurrences)
CREATE TABLE IF NOT EXISTS occurrence_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  main_occurrence_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. occurrences
CREATE TABLE IF NOT EXISTS occurrences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  protocol VARCHAR(24) NOT NULL UNIQUE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  reference_point VARCHAR(200),
  address_text VARCHAR(255) NOT NULL,
  neighborhood VARCHAR(100) NOT NULL,
  location GEOGRAPHY(Point, 4326) NOT NULL,
  status occurrence_status NOT NULL DEFAULT 'received',
  priority occurrence_priority NOT NULL DEFAULT 'media',
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  requester_id UUID REFERENCES users(id) ON DELETE SET NULL,
  requester_name VARCHAR(140),
  requester_contact TEXT, -- Criptografado em repouso (AES-256-GCM)
  group_id UUID REFERENCES occurrence_groups(id) ON DELETE SET NULL,
  is_group_main BOOLEAN NOT NULL DEFAULT TRUE,
  assisted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  response_due_at TIMESTAMPTZ NOT NULL,
  execution_due_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE occurrence_groups
    ADD CONSTRAINT fk_occurrence_groups_main
    FOREIGN KEY (main_occurrence_id) REFERENCES occurrences(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 6. occurrence_photos
CREATE TABLE IF NOT EXISTS occurrence_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  occurrence_id UUID NOT NULL REFERENCES occurrences(id) ON DELETE CASCADE,
  storage_key VARCHAR(255) NOT NULL,
  thumb_key VARCHAR(255) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. status_history
CREATE TABLE IF NOT EXISTS status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  occurrence_id UUID NOT NULL REFERENCES occurrences(id) ON DELETE CASCADE,
  from_status occurrence_status,
  to_status occurrence_status NOT NULL,
  justification TEXT,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  visible_to_citizen BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. ratings
CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  occurrence_id UUID NOT NULL UNIQUE REFERENCES occurrences(id) ON DELETE CASCADE,
  stars INT NOT NULL CHECK (stars >= 1 AND stars <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  contact TEXT,
  occurrence_id UUID NOT NULL REFERENCES occurrences(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL DEFAULT 'status_changed',
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  sent_channels JSONB NOT NULL DEFAULT '["in_app", "email"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80) NOT NULL,
  before JSONB,
  after JSONB,
  ip VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. protocol_counters
CREATE TABLE IF NOT EXISTS protocol_counters (
  year INT PRIMARY KEY,
  last_value INT NOT NULL DEFAULT 0
);

-- Índices obrigatórios de desempenho e geoprocessamento
CREATE INDEX IF NOT EXISTS idx_occurrences_protocol ON occurrences(protocol);
CREATE INDEX IF NOT EXISTS idx_occurrences_status ON occurrences(status);
CREATE INDEX IF NOT EXISTS idx_occurrences_category_id ON occurrences(category_id);
CREATE INDEX IF NOT EXISTS idx_occurrences_department_id ON occurrences(department_id);
CREATE INDEX IF NOT EXISTS idx_occurrences_neighborhood ON occurrences(neighborhood);
CREATE INDEX IF NOT EXISTS idx_occurrences_created_at ON occurrences(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_occurrences_group_id ON occurrences(group_id);
CREATE INDEX IF NOT EXISTS idx_occurrences_location_gist ON occurrences USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_occurrences_description_trgm ON occurrences USING GIN (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_status_history_occurrence_id ON status_history(occurrence_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
