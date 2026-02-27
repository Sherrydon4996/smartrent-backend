import { db } from "../../config/db.js";

export const getUnitsByBuilding = async (req, res) => {
  const { buildingId } = req.params;
  console.log(
    "[getUnitsByBuilding] received buildingId:",
    buildingId,
    typeof buildingId,
  );
  if (!buildingId || typeof buildingId !== "string") {
    return res.status(400).json({
      error: "Invalid or missing building ID",
      received: buildingId,
      type: typeof buildingId,
    });
  }

  try {
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
       WHERE u.building_id = ?
       ORDER BY u.unit_number`,
      [buildingId],
    );

    res.json(result.rows || []);
  } catch (err) {
    console.error("Error fetching units:", err);
    res.status(500).json({ error: err.message });
  }
};

export const deleteUnit = async (req, res) => {
  const { id } = req.params;

  try {
    await db.execute(`DELETE FROM units WHERE id = ?`, [id]);
    res.json({ message: "Unit deleted successfully" });
  } catch (err) {
    console.error("Error deleting unit:", err);
    res.status(500).json({ error: err.message });
  }
};
