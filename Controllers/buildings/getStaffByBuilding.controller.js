import { db } from "../../config/db.js";

export const getStaffByBuilding = async (req, res) => {
  const { building_id } = req.params;

  try {
    const staffResult = await db.execute(
      `SELECT * FROM building_management WHERE building_id = ? ORDER BY role`,
      [building_id]
    );

    res.json(staffResult.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
