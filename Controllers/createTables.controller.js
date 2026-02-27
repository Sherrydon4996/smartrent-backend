/* -----------------------------------------------------
   TABLE CREATION
----------------------------------------------------- */

import { db } from "../config/db.js";

export const createTables = async () => {
  // 1. Tenants Table
  // 1. Tenants Table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mobile TEXT NOT NULL,
      nextOfKinName TEXT,
      nextOfKinMobile TEXT,
      houseNumber TEXT NOT NULL,
      houseSize TEXT NOT NULL,
      area TEXT,
      monthlyRent INTEGER NOT NULL,
      waterBill INTEGER DEFAULT 200,
      garbageBill INTEGER DEFAULT 200,
      depositRequired INTEGER DEFAULT 0,
      depositPaid INTEGER DEFAULT 0,
      buildingName TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      entryDate TEXT,
      leavingDate TEXT,
      created_at TEXT NOT NULL,
      expenses INTEGER DEFAULT 0,
      updated_at TEXT
    );
  `);

  // 2. Transactions Table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      waterBill INTEGER DEFAULT 0,
      totalAmount INTEGER NOT NULL,
      rent INTEGER NOT NULL,
      water INTEGER NOT NULL,
      garbage INTEGER NOT NULL,
      penalty INTEGER NOT NULL,
      deposit INTEGER DEFAULT 0,
      method TEXT,
      reference TEXT,
      date TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      month TEXT NOT NULL,
      year INTEGER NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );
  `);

  // 3. Monthly Payments Summary
  await db.execute(`
    CREATE TABLE IF NOT EXISTS monthly_payments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      month TEXT NOT NULL,
      year INTEGER NOT NULL,
      rentPaid INTEGER DEFAULT 0,
      waterPaid INTEGER DEFAULT 0,
      garbagePaid INTEGER DEFAULT 0,
      depositPaid INTEGER DEFAULT 0,
      penaltiesPaid INTEGER DEFAULT 0,
      penalties INTEGER DEFAULT 0,
      balanceDue INTEGER DEFAULT 0,
      advanceBalance INTEGER DEFAULT 0,
      waterBill INTEGER DEFAULT 0,
      lastUpdated TEXT,
      UNIQUE (tenant_id, month, year),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );
  `);

  // 4. Buildings Table
  await db.execute(`
  CREATE TABLE IF NOT EXISTS buildings (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT, -- residential | commercial | mixed
    city TEXT,
    wifi_installed INTEGER DEFAULT 0, -- 0 = false, 1 = true
    icon TEXT DEFAULT 'Building2', -- Icon name for the building
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

  // 5. Global Unit Types (only names - no rent here)
  await db.execute(`
CREATE TABLE IF NOT EXISTS unit_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
  `);

  // 6. Junction Table: Per-building unit types + monthly rent (house bill)
  await db.execute(`
CREATE TABLE IF NOT EXISTS building_unit_types (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL,
  unit_type_id TEXT NOT NULL,
  monthly_rent INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (building_id, unit_type_id),

  FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE,
  FOREIGN KEY (unit_type_id) REFERENCES unit_types(id) ON DELETE RESTRICT
);

  `);

  // 7. Units Table (references building_unit_types)
  await db.execute(`
CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL,
  unit_type_id TEXT NOT NULL,
  unit_number TEXT NOT NULL,
  is_occupied INTEGER DEFAULT 0,
  tenant_name TEXT,
  tenant_phone TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (building_id, unit_number),

  FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE,
  FOREIGN KEY (unit_type_id) REFERENCES unit_types(id) ON DELETE RESTRICT
);
  `);

  // 8. Building Management (staff)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS building_management (
      id TEXT PRIMARY KEY,
      building_id TEXT NOT NULL,
      role TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(building_id) REFERENCES buildings(id) ON DELETE CASCADE
    );
  `);

  // 9. Penalties per building
  await db.execute(`
    CREATE TABLE IF NOT EXISTS penalties (
      id TEXT PRIMARY KEY,
      building_id TEXT NOT NULL,
      percentage REAL NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
    );
  `);

  // 10. Users table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      mobile TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.execute(`
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

  // Maintenance Requests Table
  await db.execute(`
CREATE TABLE  IF NOT EXISTS maintenance_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,                            
  building_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  issue_title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL CHECK(priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  cost INTEGER DEFAULT 0,
  assigned_to TEXT,
  date TEXT NOT NULL,
  month TEXT NOT NULL,
  year INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,   -- ← SET NULL instead of CASCADE
  FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE,
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
);
`);

  // Maintenance Expenses Table (for tracking costs)
  await db.execute(`
  CREATE TABLE IF NOT EXISTS maintenance_expenses (
    id TEXT PRIMARY KEY,
    maintenance_request_id TEXT NOT NULL,
    description TEXT NOT NULL,
    amount INTEGER NOT NULL,
    paid_by TEXT,
    payment_method TEXT,
    date TEXT NOT NULL,
    receipt_number TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (maintenance_request_id) REFERENCES maintenance_requests(id) ON DELETE CASCADE
  );
`);

  // Trigger to update updated_at timestamp
  await db.execute(`
  CREATE TRIGGER IF NOT EXISTS trigger_maintenance_update_timestamp
  AFTER UPDATE ON maintenance_requests
  FOR EACH ROW
  BEGIN
    UPDATE maintenance_requests SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
  END;
`);

  // Trigger to set completed_at when status changes to completed
  await db.execute(`
  CREATE TRIGGER IF NOT EXISTS trigger_maintenance_completed_at
  AFTER UPDATE ON maintenance_requests
  FOR EACH ROW
  WHEN NEW.status = 'completed' AND OLD.status != 'completed'
  BEGIN
    UPDATE maintenance_requests SET completed_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;
`);

  // Indexes for better query performance// maintenance
  await db.execute(`
  CREATE INDEX IF NOT EXISTS idx_maintenance_building ON maintenance_requests(building_id);
`);

  await db.execute(`
  CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_requests(status);
`);

  await db.execute(`
  CREATE INDEX IF NOT EXISTS idx_maintenance_tenant ON maintenance_requests(tenant_id);
`);

  await db.execute(`
  CREATE INDEX IF NOT EXISTS idx_maintenance_date ON maintenance_requests(date, month, year);
`);

  await db.execute(`
  CREATE INDEX IF NOT EXISTS idx_maintenance_expenses_request ON maintenance_expenses(maintenance_request_id);
`);

  /* Indexes tenants*/

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_tenants_building ON tenants(buildingName);`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_transactions_tenant ON transactions(tenant_id);`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_transactions_month_year ON transactions(month, year);`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_transactions_tenant_month_year 
     ON transactions(tenant_id, month, year);`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_monthly_tenant_month_year 
     ON monthly_payments(tenant_id, month, year);`,
  );
};

/* -----------------------------------------------------
   MIGRATIONS
----------------------------------------------------- */

// database/schema.js

export const runMigrations = async () => {
  try {
    const tenantInfo = await db.execute(`PRAGMA table_info(tenants);`);
    const tenantColumns = tenantInfo.rows.map((c) => c.name);

    if (!tenantColumns.includes("expenses")) {
      await db.execute(
        `ALTER TABLE tenants ADD COLUMN expenses INTEGER DEFAULT 0;`,
      );
      await db.execute(`
        UPDATE tenants SET expenses = 0 WHERE expenses IS NULL;
      `);
      console.log("Expenses column added successfully");
    }

    if (!tenantColumns.includes("tenant_credit")) {
      await db.execute(
        `ALTER TABLE tenants ADD COLUMN tenant_credit INTEGER DEFAULT 0;`,
      );
      await db.execute(`
        UPDATE tenants SET tenant_credit = 0 WHERE tenant_credit IS NULL;
      `);
      console.log("Tenant credit column added successfully");
    }
    if (!tenantColumns.includes("email")) {
      await db.execute(
        `ALTER TABLE tenants ADD COLUMN email TEXT DEFAULT NULL;`,
      );
      console.log("Email column added successfully");
    }

    //users
    const userInfo = await db.execute(`PRAGMA table_info(users);`);
    const userColumns = userInfo.rows.map((c) => c.name);

    if (!userColumns.includes("session_started_at")) {
      await db.execute(`ALTER TABLE users ADD COLUMN session_started_at TEXT;`);
    }

    if (!userColumns.includes("session_expires_at")) {
      await db.execute(`ALTER TABLE users ADD COLUMN session_expires_at TEXT;`);
    }

    // updated_at column
    if (!tenantColumns.includes("updated_at")) {
      await db.execute(`ALTER TABLE tenants ADD COLUMN updated_at TEXT;`);
      await db.execute(`
        UPDATE tenants SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;
      `);
      await db.execute(`
        CREATE TRIGGER IF NOT EXISTS trigger_tenants_update_timestamp
        AFTER UPDATE ON tenants
        FOR EACH ROW
        BEGIN
          UPDATE tenants SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
        END;
      `);
    }

    // UNIQUE tenant (mobile + building)
    await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_tenant_mobile_building
      ON tenants(mobile, buildingName);
    `);

    // Trigger to reset expenses when tenant status changes to 'left'
    await db.execute(`
      CREATE TRIGGER IF NOT EXISTS trigger_reset_expenses_on_leave
      AFTER UPDATE ON tenants
      FOR EACH ROW
      WHEN NEW.status = 'left' AND OLD.status = 'active'
      BEGIN
        UPDATE tenants SET expenses = 0 WHERE id = NEW.id;
      END;
    `);

    console.log("Migrations completed successfully");
  } catch (error) {
    console.error("Migration error:", error.message || error);
  }
};
