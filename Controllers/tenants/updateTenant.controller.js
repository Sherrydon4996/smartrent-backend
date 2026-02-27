import { db } from "../../config/db.js";

/**
 * Update an existing tenant
 */
export const updateTenant = async (req, res, next) => {
  const { tenantId } = req.params;
  const {
    name,
    mobile,
    email, // ← added
    nextOfKinName,
    nextOfKinMobile,
    houseNumber,
    houseSize,
    area,
    buildingName,
    monthlyRent,
    garbageBill,
    status,
    expenses,
  } = req.body;

  if (!tenantId) {
    return res.status(400).json({
      success: false,
      message: "Tenant ID is required",
    });
  }

  try {
    // Check if tenant exists
    const existingTenant = await db.execute({
      sql: "SELECT * FROM tenants WHERE id = ?",
      args: [tenantId],
    });

    if (existingTenant.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found",
      });
    }

    const currentTenant = existingTenant.rows[0];
    const oldHouseNumber = currentTenant.houseNumber;
    const oldBuildingName = currentTenant.buildingName;
    const oldStatus = currentTenant.status;

    /* ---- Validate tenant name format (first and last name required) ---- */
    const nameRegex = /^[a-zA-Z]+(?:[\s'-][a-zA-Z]+)+$/;
    if (!nameRegex.test(name?.trim())) {
      return res.status(400).json({
        success: false,
        message:
          "Tenant name must include both first and last name (e.g., 'John Doe')",
      });
    }

    /* ---- Validate next of kin name format (first and last name required) ---- */
    if (nextOfKinName && !nameRegex.test(nextOfKinName?.trim())) {
      return res.status(400).json({
        success: false,
        message:
          "Next of kin name must include both first and last name (e.g., 'Jane Doe')",
      });
    }

    /* ---- Normalize mobile numbers ---- */
    const normalizedMobile = mobile.replace(/\s+/g, "");
    const normalizedNextOfKinMobile = nextOfKinMobile
      ? nextOfKinMobile.replace(/\s+/g, "")
      : null;

    /* ---- Validate tenant and next of kin cannot have same phone number ---- */
    if (
      normalizedNextOfKinMobile &&
      normalizedMobile === normalizedNextOfKinMobile
    ) {
      return res.status(400).json({
        success: false,
        message: "Tenant and next of kin cannot have the same phone number",
      });
    }

    /* ---- Check if tenant with same mobile already exists in building (excluding current tenant) ---- */
    const existingTenantMobile = await db.execute({
      sql: `
        SELECT id 
        FROM tenants 
        WHERE mobile = ? AND buildingName = ? AND id != ?
        LIMIT 1
      `,
      args: [normalizedMobile, buildingName, tenantId],
    });

    if (existingTenantMobile.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          "Another tenant with this mobile number already exists in this building",
      });
    }

    /* ---- Check for duplicate tenant full name (case-insensitive) in building (excluding current tenant) ---- */
    const normalizedName = name.trim().toLowerCase();
    const existingName = await db.execute({
      sql: `
        SELECT id, name 
        FROM tenants 
        WHERE LOWER(TRIM(name)) = ? AND buildingName = ? AND id != ?
        LIMIT 1
      `,
      args: [normalizedName, buildingName, tenantId],
    });

    if (existingName.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: `A tenant with the name "${existingName.rows[0].name}" already exists in this building. Please use a surname or middle name to differentiate.`,
      });
    }

    /* ---- Check for duplicate next of kin name in building (if provided, excluding current tenant) ---- */
    if (nextOfKinName) {
      const normalizedNextOfKinName = nextOfKinName.trim().toLowerCase();
      const existingNextOfKinName = await db.execute({
        sql: `
          SELECT id, name, nextOfKinName 
          FROM tenants 
          WHERE LOWER(TRIM(nextOfKinName)) = ? AND buildingName = ? AND id != ?
          LIMIT 1
        `,
        args: [normalizedNextOfKinName, buildingName, tenantId],
      });

      if (existingNextOfKinName.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: `Next of kin "${existingNextOfKinName.rows[0].nextOfKinName}" is already registered for tenant "${existingNextOfKinName.rows[0].name}" in this building. Please use a different next of kin or add distinguishing details.`,
        });
      }
    }

    /* ---- Check for duplicate next of kin mobile in building (if provided, excluding current tenant) ---- */
    if (normalizedNextOfKinMobile) {
      const existingNextOfKinMobile = await db.execute({
        sql: `
          SELECT id, name, nextOfKinMobile 
          FROM tenants 
          WHERE nextOfKinMobile = ? AND buildingName = ? AND id != ?
          LIMIT 1
        `,
        args: [normalizedNextOfKinMobile, buildingName, tenantId],
      });

      if (existingNextOfKinMobile.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: `Next of kin mobile number is already registered for tenant "${existingNextOfKinMobile.rows[0].name}" in this building.`,
        });
      }
    }

    // Calculate new cumulative expenses
    let newExpenses = currentTenant.expenses || 0;

    if (expenses !== undefined && expenses !== null && expenses !== "") {
      const expensesToAdd = parseFloat(expenses) || 0;
      if (expensesToAdd > 0) {
        newExpenses = newExpenses + expensesToAdd;
      }
    }

    // Check status changes
    const isLeavingNow = status === "left" && oldStatus !== "left";
    const isReturningActive = status === "active" && oldStatus === "left";

    const leavingDate = isLeavingNow
      ? new Date().toISOString().split("T")[0]
      : isReturningActive
        ? null // Clear leaving date when marking as active
        : currentTenant.leavingDate;

    // Check if house number or building changed
    const houseChanged =
      houseNumber !== oldHouseNumber || buildingName !== oldBuildingName;

    // Variables to track new unit details and rent
    let newUnitMonthlyRent = monthlyRent;
    let newUnitType = houseSize;
    let depositRequired = currentTenant.depositRequired;
    let depositPaid = currentTenant.depositPaid;

    if (houseChanged) {
      // Vacate the old unit
      const oldUnit = await db.execute({
        sql: `
          SELECT u.id 
          FROM units u
          JOIN buildings b ON u.building_id = b.id
          WHERE b.name = ? AND u.unit_number = ?
          LIMIT 1
        `,
        args: [oldBuildingName, oldHouseNumber],
      });

      if (oldUnit.rows.length > 0) {
        await db.execute({
          sql: `
            UPDATE units 
            SET is_occupied = 0, 
                tenant_name = NULL, 
                tenant_phone = NULL
            WHERE id = ?
          `,
          args: [oldUnit.rows[0].id],
        });
      }

      // Find and occupy the new unit (only if tenant is active)
      // Get unit details including rent from building_unit_types
      const newUnit = await db.execute({
        sql: `
          SELECT 
            u.id, 
            u.is_occupied,
            u.unit_type_id,
            b.id as building_id,
            but.monthly_rent,
            ut.name as unit_type_name
          FROM units u
          JOIN buildings b ON u.building_id = b.id
          JOIN unit_types ut ON u.unit_type_id = ut.id
          JOIN building_unit_types but ON but.building_id = b.id 
            AND but.unit_type_id = u.unit_type_id
          WHERE b.name = ? AND u.unit_number = ?
          LIMIT 1
        `,
        args: [buildingName, houseNumber],
      });

      if (newUnit.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: `Unit ${houseNumber} not found in building ${buildingName}`,
        });
      }

      if (newUnit.rows[0].is_occupied && status === "active") {
        return res.status(400).json({
          success: false,
          message: `Unit ${houseNumber} is already occupied`,
        });
      }

      // Get the monthly rent from the database for the new unit
      newUnitMonthlyRent = newUnit.rows[0].monthly_rent;
      newUnitType = newUnit.rows[0].unit_type_name;

      // Update deposit if unit type (rent) has changed
      if (newUnitMonthlyRent !== currentTenant.monthlyRent) {
        depositRequired = newUnitMonthlyRent;
        depositPaid = newUnitMonthlyRent; // Set new deposit equal to new monthly rent
      }

      // Occupy the new unit only if status is active
      if (status === "active") {
        await db.execute({
          sql: `
            UPDATE units 
            SET is_occupied = 1, 
                tenant_name = ?, 
                tenant_phone = ?
            WHERE id = ?
          `,
          args: [name, normalizedMobile, newUnit.rows[0].id],
        });
      }
    } else {
      // Same house - handle status changes
      const currentUnit = await db.execute({
        sql: `
          SELECT u.id 
          FROM units u
          JOIN buildings b ON u.building_id = b.id
          WHERE b.name = ? AND u.unit_number = ?
          LIMIT 1
        `,
        args: [buildingName, houseNumber],
      });

      if (currentUnit.rows.length > 0) {
        // If tenant is leaving, vacate the unit
        if (isLeavingNow) {
          await db.execute({
            sql: `
              UPDATE units 
              SET is_occupied = 0, 
                  tenant_name = NULL, 
                  tenant_phone = NULL
              WHERE id = ?
            `,
            args: [currentUnit.rows[0].id],
          });
        }
        // If tenant is returning to active status, re-occupy the unit
        else if (isReturningActive) {
          await db.execute({
            sql: `
              UPDATE units 
              SET is_occupied = 1, 
                  tenant_name = ?, 
                  tenant_phone = ?
              WHERE id = ?
            `,
            args: [name, normalizedMobile, currentUnit.rows[0].id],
          });
        }
        // Just update tenant info for active tenants
        else if (status === "active") {
          await db.execute({
            sql: `
              UPDATE units 
              SET tenant_name = ?, 
                  tenant_phone = ?,
                  is_occupied = 1
              WHERE id = ?
            `,
            args: [name, normalizedMobile, currentUnit.rows[0].id],
          });
        }
      }
    }

    // Reset expenses to 0 if tenant is leaving
    const finalExpenses = status === "left" ? 0 : newExpenses;

    // Use provided garbageBill or keep existing value
    const finalGarbageBill =
      garbageBill !== undefined && garbageBill !== null
        ? garbageBill
        : currentTenant.garbageBill || 150;

    // Update tenant with new deposit values if unit changed
    await db.execute({
      sql: `
        UPDATE tenants
        SET 
          name = ?,
          mobile = ?,
          email = ?,                    
          nextOfKinName = ?,
          nextOfKinMobile = ?,
          houseNumber = ?,
          houseSize = ?,
          area = ?,
          buildingName = ?,
          monthlyRent = ?,
          garbageBill = ?,
          status = ?,
          leavingDate = ?,
          expenses = ?,
          depositRequired = ?,
          depositPaid = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      args: [
        name,
        normalizedMobile,
        email || null, // ← added (allow null/empty)
        nextOfKinName || null,
        normalizedNextOfKinMobile,
        houseNumber,
        newUnitType,
        area || null,
        buildingName,
        newUnitMonthlyRent,
        finalGarbageBill,
        status,
        leavingDate,
        finalExpenses,
        depositRequired,
        depositPaid,
        tenantId,
      ],
    });

    // If deposit changed due to unit type change, update monthly_payments
    if (houseChanged && depositPaid !== currentTenant.depositPaid) {
      const depositDifference = depositPaid - currentTenant.depositPaid;
      const now = new Date();
      const currentMonth = now.toLocaleString("default", { month: "long" });
      const currentYear = now.getFullYear();

      // Check if monthly_payment record exists for current month
      const existingPayment = await db.execute({
        sql: `
          SELECT id, depositPaid 
          FROM monthly_payments 
          WHERE tenant_id = ? AND month = ? AND year = ?
        `,
        args: [tenantId, currentMonth, currentYear],
      });

      if (existingPayment.rows.length > 0) {
        // Update existing monthly_payment record
        const currentDepositPaid = existingPayment.rows[0].depositPaid || 0;
        await db.execute({
          sql: `
            UPDATE monthly_payments 
            SET depositPaid = ?,
                lastUpdated = ?
            WHERE id = ?
          `,
          args: [
            currentDepositPaid + depositDifference,
            now.toISOString(),
            existingPayment.rows[0].id,
          ],
        });
      } else {
        // Create new monthly_payment record for current month
        const { v4: uuidv4 } = await import("uuid");
        const monthlyPaymentId = uuidv4();

        await db.execute({
          sql: `
            INSERT INTO monthly_payments (
              id,
              tenant_id,
              month,
              year,
              rentPaid,
              waterPaid,
              garbagePaid,
              depositPaid,
              penaltiesPaid,
              penalties,
              balanceDue,
              advanceBalance,
              waterBill,
              lastUpdated
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            monthlyPaymentId,
            tenantId,
            currentMonth,
            currentYear,
            0,
            0,
            0,
            depositDifference, // Record the deposit difference (could be positive or negative)
            0,
            0,
            0,
            0,
            0,
            now.toISOString(),
          ],
        });
      }
    }

    // Fetch updated tenant
    const updatedTenant = await db.execute({
      sql: "SELECT * FROM tenants WHERE id = ?",
      args: [tenantId],
    });

    return res.status(200).json({
      success: true,
      message: "Tenant updated successfully",
      data: {
        ...updatedTenant.rows[0],
        balanceDue: 0,
        advanceBalance: 0,
        penalties: 0,
      },
    });
  } catch (err) {
    console.error("Error updating tenant:", err);
    next(err);
  }
};
