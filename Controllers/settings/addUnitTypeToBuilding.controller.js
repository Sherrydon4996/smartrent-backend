import { v4 as uuidv4 } from "uuid";
import { db } from "../../config/db.js";

export const addUnitTypeToBuilding = async (req, res) => {
  try {
    const { building_id, name, monthly_rent } = req.body;

    if (!building_id || !name?.trim() || monthly_rent == null) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: building_id, name, and monthly_rent",
      });
    }

    // Step 1: Check if unit type exists, if not create it
    let unitTypeResult = await db.execute(
      `SELECT id FROM unit_types WHERE name = ?`,
      [name.trim()]
    );

    let unitTypeId;

    if (!unitTypeResult.rows || unitTypeResult.rows.length === 0) {
      // Create new unit type
      unitTypeId = uuidv4();
      await db.execute(
        `INSERT INTO unit_types (id, name, created_at) VALUES (?, ?, ?)`,
        [unitTypeId, name.trim(), new Date().toISOString()]
      );
    } else {
      unitTypeId = unitTypeResult.rows[0].id;
    }

    // Step 2: Check if this building already has this unit type
    const existingConfig = await db.execute(
      `SELECT id FROM building_unit_types 
       WHERE building_id = ? AND unit_type_id = ?`,
      [building_id, unitTypeId]
    );

    if (existingConfig.rows && existingConfig.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "This unit type is already configured for this building",
      });
    }

    // Step 3: Add unit type to building
    const configId = uuidv4();
    await db.execute(
      `INSERT INTO building_unit_types 
       (id, building_id, unit_type_id, monthly_rent, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        configId,
        building_id,
        unitTypeId,
        monthly_rent,
        new Date().toISOString(),
      ]
    );

    // Step 4: Return the complete record
    const result = await db.execute(
      `SELECT 
        but.id,
        but.building_id,
        but.unit_type_id,
        ut.name as unit_type_name,
        but.monthly_rent,
        but.created_at
       FROM building_unit_types but
       JOIN unit_types ut ON but.unit_type_id = ut.id
       WHERE but.id = ?`,
      [configId]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error adding unit type to building:", err);
    res.status(500).json({
      success: false,
      message: "Failed to add unit type to building",
      error: err.message,
    });
  }
};
