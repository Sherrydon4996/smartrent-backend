// database/tenantController.js  (or wherever this file lives)

import { db } from "../../config/db.js";
import { v4 as uuidv4 } from "uuid";

/* -----------------------------------------------------
   CREATE TENANT
----------------------------------------------------- */

export const createTenant = async (req, res, next) => {
  try {
    const {
      name,
      mobile,
      email,
      nextOfKinName,
      nextOfKinMobile,
      houseNumber,
      houseSize,
      area,
      buildingName,
      depositPaid = 0,
      garbageBill = 150,
      status = "active",
    } = req.body;

    console.log("email", email);

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

    /* ---- Check if tenant with same mobile already exists in building ---- */
    const existingTenant = await db.execute({
      sql: `
        SELECT id 
        FROM tenants 
        WHERE mobile = ? AND buildingName = ?
        LIMIT 1
      `,
      args: [normalizedMobile, buildingName],
    });

    if (existingTenant.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          "Tenant with this mobile number already exists in this building",
      });
    }

    /* ---- Check for duplicate tenant full name (case-insensitive) in building ---- */
    const normalizedName = name.trim().toLowerCase();
    const existingName = await db.execute({
      sql: `
        SELECT id, name 
        FROM tenants 
        WHERE LOWER(TRIM(name)) = ? AND buildingName = ?
        LIMIT 1
      `,
      args: [normalizedName, buildingName],
    });

    if (existingName.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: `A tenant with the name "${existingName.rows[0].name}" already exists in this building. Please use a surname or middle name to differentiate.`,
      });
    }

    /* ---- Check for duplicate next of kin name in building (if provided) ---- */
    if (nextOfKinName) {
      const normalizedNextOfKinName = nextOfKinName.trim().toLowerCase();
      const existingNextOfKinName = await db.execute({
        sql: `
          SELECT id, name, nextOfKinName 
          FROM tenants 
          WHERE LOWER(TRIM(nextOfKinName)) = ? AND buildingName = ?
          LIMIT 1
        `,
        args: [normalizedNextOfKinName, buildingName],
      });

      if (existingNextOfKinName.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: `Next of kin "${existingNextOfKinName.rows[0].nextOfKinName}" is already registered for tenant "${existingNextOfKinName.rows[0].name}" in this building. Please use a different next of kin or add distinguishing details.`,
        });
      }
    }

    /* ---- Check for duplicate next of kin mobile in building (if provided) ---- */
    if (normalizedNextOfKinMobile) {
      const existingNextOfKinMobile = await db.execute({
        sql: `
          SELECT id, name, nextOfKinMobile 
          FROM tenants 
          WHERE nextOfKinMobile = ? AND buildingName = ?
          LIMIT 1
        `,
        args: [normalizedNextOfKinMobile, buildingName],
      });

      if (existingNextOfKinMobile.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: `Next of kin mobile number is already registered for tenant "${existingNextOfKinMobile.rows[0].name}" in this building.`,
        });
      }
    }

    /* ---- Find the unit and get rent from building_unit_types ---- */
    const unitResult = await db.execute({
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

    if (unitResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Unit ${houseNumber} not found in building ${buildingName}`,
      });
    }

    const unit = unitResult.rows[0];

    if (unit.is_occupied) {
      return res.status(400).json({
        success: false,
        message: `Unit ${houseNumber} is already occupied`,
      });
    }

    /* ---- Get monthly rent from the database ---- */
    const monthlyRent = unit.monthly_rent;

    /* ---- Validate houseSize matches unit type ---- */
    if (houseSize && houseSize !== unit.unit_type_name) {
      console.warn(
        `Warning: Provided houseSize "${houseSize}" doesn't match unit type "${unit.unit_type_name}". Using database unit type.`,
      );
    }

    /* ---- Create tenant ---- */
    const id = uuidv4();
    const entryDate = new Date().toISOString();
    const waterBill = 0;
    const expenses = 0;

    await db.execute({
      sql: `
        INSERT INTO tenants (
          id, name, mobile, email, nextOfKinName, nextOfKinMobile,
          houseNumber, houseSize, area, monthlyRent,
          waterBill, garbageBill,
          depositRequired, depositPaid,
          buildingName, status, entryDate, expenses, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id,
        name,
        normalizedMobile,
        email || null, // ← added
        nextOfKinName || null,
        normalizedNextOfKinMobile,
        houseNumber,
        unit.unit_type_name,
        area || null,
        monthlyRent,
        waterBill,
        garbageBill,
        depositPaid,
        depositPaid,
        buildingName,
        status,
        entryDate,
        expenses,
        entryDate,
      ],
    });

    /* ---- Update the unit to mark as occupied ---- */
    await db.execute({
      sql: `
        UPDATE units 
        SET is_occupied = 1, 
            tenant_name = ?, 
            tenant_phone = ?
        WHERE id = ?
      `,
      args: [name, normalizedMobile, unit.id],
    });

    // ──────────────────────────────────────────────────────────────
    // RECORD INITIAL DEPOSIT TRANSACTION (only when depositPaid > 0)
    // Deposit is SECURITY → does NOT create advance balance
    // ──────────────────────────────────────────────────────────────
    let depositTransactionId = null;
    let entryMonth = null;
    let entryYear = null;

    if (depositPaid > 0) {
      const now = new Date();
      entryMonth = now.toLocaleString("default", { month: "long" });
      entryYear = now.getFullYear();

      depositTransactionId = uuidv4();

      await db.execute({
        sql: `
          INSERT INTO transactions (
            id,
            tenant_id,
            totalAmount,
            rent,
            water,
            garbage,
            penalty,
            deposit,
            method,
            reference,
            date,
            timestamp,
            month,
            year,
            notes,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          depositTransactionId,
          id,
          depositPaid,
          0,
          0,
          0,
          0,
          depositPaid,
          "cash",
          null,
          now.toISOString().split("T")[0],
          now.toISOString(),
          entryMonth,
          entryYear,
          "Initial security deposit (refundable)",
          now.toISOString(),
        ],
      });

      // Create monthly_payments entry for move-in month
      // → advanceBalance = 0 (deposit is not advance rent)
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
          id,
          entryMonth,
          entryYear,
          0,
          0,
          0,
          depositPaid, // record deposit payment for history
          0,
          0,
          0, // no balance due on creation
          0, // no advance balance from security deposit
          0,
          now.toISOString(),
        ],
      });
    }

    // ──────────────────────────────────────────────────────────────
    // Success response
    // ──────────────────────────────────────────────────────────────
    const responseData = {
      id,
      name,
      mobile: normalizedMobile,
      houseNumber,
      houseSize: unit.unit_type_name,
      area,
      buildingName,
      monthlyRent,
      depositPaid,
      waterBill,
      garbageBill,
      expenses,
      status,
      entryDate,
    };

    if (depositPaid > 0) {
      responseData.depositTransactionId = depositTransactionId;
      responseData.entryMonth = entryMonth;
      responseData.entryYear = entryYear;
    }

    res.status(201).json({
      success: true,
      data: responseData,
    });
  } catch (err) {
    if (err.message?.includes("UNIQUE")) {
      return res.status(409).json({
        success: false,
        message: "Tenant already exists",
      });
    }

    console.error("Error creating tenant:", err);
    next(err);
  }
};
