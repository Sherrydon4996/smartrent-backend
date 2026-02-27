// Controllers/settings/removeUnitTypeFromBuilding.controller.js
import { db } from "../../config/db.js";

export const removeUnitTypeFromBuilding = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if config exists
    const existingConfig = await db.execute(
      `SELECT building_id, unit_type_id FROM building_unit_types WHERE id = ?`,
      [id],
    );

    if (!existingConfig.rows || existingConfig.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Building unit type configuration not found",
      });
    }

    const { building_id, unit_type_id } = existingConfig.rows[0];

    // ✅ FIXED: Check if any units are using this building + unit_type combination
    const unitsUsingConfig = await db.execute(
      `SELECT id FROM units WHERE building_id = ? AND unit_type_id = ?`,
      [building_id, unit_type_id],
    );

    if (unitsUsingConfig.rows && unitsUsingConfig.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot remove unit type - ${unitsUsingConfig.rows.length} unit(s) are using this configuration`,
        code: "UNITS_IN_USE",
      });
    }

    // Delete the building_unit_type configuration
    await db.execute(`DELETE FROM building_unit_types WHERE id = ?`, [id]);

    res.json({
      success: true,
      message: "Unit type removed from building successfully",
    });
  } catch (error) {
    console.error("Error removing unit type from building:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove unit type from building",
      error: error.message,
    });
  }
};
