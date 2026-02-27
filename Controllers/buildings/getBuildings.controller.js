import { db } from "../../config/db.js";

// // Get all buildings with units and staff
export const getAllBuildings = async (req, res) => {
  try {
    const buildingsResult = await db.execute(
      `SELECT * FROM buildings ORDER BY created_at DESC`,
    );
    const buildings = buildingsResult.rows;

    // Fetch units for all buildings
    const unitsResult = await db.execute(
      `SELECT * FROM units ORDER BY building_id, unit_number`,
    );
    const units = unitsResult.rows;

    // Fetch staff for all buildings
    const staffResult = await db.execute(
      `SELECT * FROM building_management ORDER BY building_id, role`,
    );
    const staff = staffResult.rows;

    // Group units and staff by building_id
    const buildingsWithDetails = buildings.map((building) => ({
      ...building,
      wifi_installed: Boolean(building.wifi_installed),
      units: units
        .filter((u) => u.building_id === building.id)
        .map((u) => ({
          ...u,
          is_occupied: Boolean(u.is_occupied),
        })),
      staff: staff.filter((s) => s.building_id === building.id),
    }));

    res.json(buildingsWithDetails);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
