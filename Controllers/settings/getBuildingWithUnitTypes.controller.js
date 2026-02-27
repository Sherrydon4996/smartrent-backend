import { db } from "../../config/db.js";

export const getBuildingsWithUnitTypes = async (req, res) => {
  try {
    // Get all buildings
    const buildings = await db.execute(
      `SELECT id, name, icon, type, city, wifi_installed FROM buildings`
    );

    // Get all unit type configs with names
    const unitTypeConfigs = await db.execute(
      `SELECT 
        but.id,
        but.building_id,
        but.unit_type_id,
        ut.name as unit_type_name,
        but.monthly_rent,
        but.created_at
       FROM building_unit_types but
       JOIN unit_types ut ON but.unit_type_id = ut.id
       ORDER BY but.created_at DESC`
    );

    // Group unit types by building
    const buildingsWithUnitTypes = buildings.rows.map((building) => ({
      ...building,
      unitTypes: unitTypeConfigs.rows.filter(
        (config) => config.building_id === building.id
      ),
    }));

    res.status(200).json({
      success: true,
      records: buildingsWithUnitTypes,
    });
  } catch (err) {
    console.error("Error fetching buildings with unit types:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch buildings",
      error: err.message,
    });
  }
};
