// controllers/unitController.js
import { v4 as uuidv4 } from "uuid";
import { db } from "../../config/db.js";

export const createUnit = async (req, res) => {
  const { id, building_id, unit_type_id, unit_number } = req.body;

  if (!building_id || !unit_type_id || !unit_number) {
    return res.status(400).json({
      error: "Building ID, unit type, and unit number are required",
    });
  }

  try {
    // Verify the unit_type exists for this building
    const configCheck = await db.execute(
      `SELECT id FROM building_unit_types 
       WHERE building_id = ? AND unit_type_id = ?`,
      [building_id, unit_type_id]
    );

    if (!configCheck.rows || configCheck.rows.length === 0) {
      return res.status(400).json({
        error: "This unit type is not configured for this building",
      });
    }

    const unitId = id || uuidv4();
    await db.execute(
      `INSERT INTO units (id, building_id, unit_type_id, unit_number, is_occupied, created_at) 
       VALUES (?, ?, ?, ?, 0, ?)`,
      [unitId, building_id, unit_type_id, unit_number, new Date().toISOString()]
    );

    // Return complete unit data with type name and rent
    const result = await db.execute(
      `SELECT 
        u.id,
        u.building_id,
        u.unit_type_id,
        ut.name as unit_type_name,
        u.unit_number,
        u.is_occupied,
        u.tenant_name,
        u.tenant_phone,
        but.monthly_rent,
        u.created_at
       FROM units u
       JOIN unit_types ut ON u.unit_type_id = ut.id
       JOIN building_unit_types but ON but.building_id = u.building_id 
         AND but.unit_type_id = u.unit_type_id
       WHERE u.id = ?`,
      [unitId]
    );

    res.json({
      message: "Unit created successfully",
      id: unitId,
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error creating unit:", err);
    res.status(500).json({ error: err.message });
  }
};
