import { db } from "../../config/db.js";

export const updateUnit = async (req, res) => {
  const { id } = req.params;
  const { unit_type_id, unit_number, is_occupied, tenant_name, tenant_phone } =
    req.body;

  try {
    const updates = [];
    const values = [];

    if (unit_type_id !== undefined) {
      updates.push("unit_type_id = ?");
      values.push(unit_type_id);
    }
    if (unit_number !== undefined) {
      updates.push("unit_number = ?");
      values.push(unit_number);
    }
    if (is_occupied !== undefined) {
      updates.push("is_occupied = ?");
      values.push(is_occupied ? 1 : 0);
    }
    if (tenant_name !== undefined) {
      updates.push("tenant_name = ?");
      values.push(tenant_name || null);
    }
    if (tenant_phone !== undefined) {
      updates.push("tenant_phone = ?");
      values.push(tenant_phone || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(id);
    await db.execute(
      `UPDATE units SET ${updates.join(", ")} WHERE id = ?`,
      values
    );

    // Return updated unit with complete data
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
      [id]
    );

    res.json({
      message: "Unit updated successfully",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error updating unit:", err);
    res.status(500).json({ error: err.message });
  }
};
