import { db } from "../../config/db.js";

export const getBuildingWithUnitTypesId = async (req, res) => {
  try {
    const { id } = req.params;

    // Get building
    const buildingResult = await db.execute(
      `
      SELECT id, name, type, city, wifi_installed, icon, created_at
      FROM buildings
      WHERE id = ?
    `,
      [id],
    );

    if (!buildingResult.rows || buildingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Building not found",
      });
    }

    const building = buildingResult.rows[0];

    // Get unit types for this building
    const unitTypesResult = await db.execute(
      `
      SELECT 
        but.id,
        but.building_id,
        but.unit_type_id,
        but.monthly_rent,
        but.max_units,
        ut.name as unit_type_name
      FROM building_unit_types but
      LEFT JOIN unit_types ut ON but.unit_type_id = ut.id
      WHERE but.building_id = ?
      ORDER BY ut.name ASC
    `,
      [id],
    );

    res.json({
      success: true,
      data: {
        ...building,
        unitTypes: unitTypesResult.rows || [],
      },
    });
  } catch (error) {
    console.error("Error fetching building with unit types:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch building with unit types",
      error: error.message,
    });
  }
};
