import { db } from "../../config/db.js";

export const getBuildingById = async (req, res) => {
  const { id } = req.params;
  try {
    const buildingResult = await db.execute(
      `SELECT * FROM buildings WHERE id = ?`,
      [id]
    );
    const building = buildingResult.rows[0];

    if (!building) {
      return res.status(404).json({ error: "Building not found" });
    }

    // Fetch units
    const unitsResult = await db.execute(
      `SELECT * FROM units WHERE building_id = ?`,
      [id]
    );
    const units = unitsResult.rows.map((u) => ({
      ...u,
      is_occupied: Boolean(u.is_occupied),
    }));

    // Fetch staff
    const staffResult = await db.execute(
      `SELECT * FROM building_management WHERE building_id = ?`,
      [id]
    );
    const staff = staffResult.rows;

    res.json({
      ...building,
      wifi_installed: Boolean(building.wifi_installed),
      units,
      staff,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
