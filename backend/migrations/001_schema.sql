-- CRMaosBike - Database Schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- BRANCHES
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(10) UNIQUE NOT NULL,
  address TEXT,
  phone VARCHAR(20),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  phone VARCHAR(20),
  role VARCHAR(20) NOT NULL DEFAULT 'vendedor',
  branch_id UUID REFERENCES branches(id),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MOTORCYCLE CATALOG (models)
CREATE TABLE IF NOT EXISTS moto_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand VARCHAR(80) NOT NULL,
  model VARCHAR(120) NOT NULL,
  year INTEGER NOT NULL,
  cc INTEGER DEFAULT 0,
  category VARCHAR(60),
  colors JSONB DEFAULT '[]',
  price INTEGER NOT NULL,
  bonus INTEGER DEFAULT 0,
  image_url TEXT,
  gallery JSONB DEFAULT '[]',
  spec_url TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INVENTORY (individual units)
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID NOT NULL REFERENCES branches(id),
  model_id UUID REFERENCES moto_models(id),
  year INTEGER NOT NULL,
  brand VARCHAR(80) NOT NULL,
  model VARCHAR(120) NOT NULL,
  color VARCHAR(60) NOT NULL,
  chassis VARCHAR(40) UNIQUE NOT NULL,
  motor_num VARCHAR(40),
  status VARCHAR(20) DEFAULT 'disponible',
  price INTEGER NOT NULL,
  chassis_photo TEXT,
  motor_photo TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- LEADS / TICKETS
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_num VARCHAR(20) UNIQUE NOT NULL,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80),
  rut VARCHAR(15),
  birthdate VARCHAR(20),
  email VARCHAR(150),
  phone VARCHAR(20),
  comuna VARCHAR(80),
  source VARCHAR(30) DEFAULT 'presencial',
  branch_id UUID REFERENCES branches(id),
  seller_id UUID REFERENCES users(id),
  model_id UUID REFERENCES moto_models(id),
  color_pref VARCHAR(60),
  status VARCHAR(30) DEFAULT 'abierto',
  priority VARCHAR(10) DEFAULT 'media',
  wants_financing BOOLEAN DEFAULT false,
  sit_laboral VARCHAR(50),
  continuidad VARCHAR(50),
  renta INTEGER DEFAULT 0,
  pie INTEGER DEFAULT 0,
  test_ride BOOLEAN DEFAULT false,
  fin_status VARCHAR(30) DEFAULT 'sin_movimiento',
  fin_institution VARCHAR(50) DEFAULT 'Autofin',
  rechazo_motivo VARCHAR(200),
  obs_vendedor TEXT,
  obs_supervisor TEXT,
  last_contact_at TIMESTAMPTZ,
  post_venta JSONB DEFAULT '{"factura":false,"pagoReg":false,"homSol":false,"homRec":false,"enrolada":false,"entregada":false}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TIMELINE (activity log per ticket)
CREATE TABLE IF NOT EXISTS timeline (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  type VARCHAR(30) NOT NULL,
  title VARCHAR(200) NOT NULL,
  note TEXT,
  method VARCHAR(30),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_seller ON tickets(seller_id);
CREATE INDEX IF NOT EXISTS idx_tickets_branch ON tickets(branch_id);
CREATE INDEX IF NOT EXISTS idx_timeline_ticket ON timeline(ticket_id);
CREATE INDEX IF NOT EXISTS idx_inventory_branch ON inventory(branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status);

-- AUTO UPDATE updated_at
CREATE OR REPLACE FUNCTION update_timestamp() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tickets_ts ON tickets;
CREATE TRIGGER trg_tickets_ts BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION update_timestamp();
DROP TRIGGER IF EXISTS trg_inventory_ts ON inventory;
CREATE TRIGGER trg_inventory_ts BEFORE UPDATE ON inventory FOR EACH ROW EXECUTE FUNCTION update_timestamp();
