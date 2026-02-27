export const updateBuildingUnitType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, monthly_rent } = req.body;

    if (!name?.trim() || monthly_rent == null) {
      return res.status(400).json({
        success: false,
        message: "Name and monthly_rent are required",
      });
    }

    // Get current config
    const currentConfig = await db.execute(
      `SELECT unit_type_id, building_id FROM building_unit_types WHERE id = ?`,
      [id]
    );

    if (!currentConfig.rows || currentConfig.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Building unit type configuration not found",
      });
    }

    const { unit_type_id: currentUnitTypeId, building_id } =
      currentConfig.rows[0];

    // Check if unit type with new name exists
    let newUnitTypeId;
    const unitTypeResult = await db.execute(
      `SELECT id FROM unit_types WHERE name = ?`,
      [name.trim()]
    );

    if (!unitTypeResult.rows || unitTypeResult.rows.length === 0) {
      // Create new unit type
      newUnitTypeId = uuidv4();
      await db.execute(
        `INSERT INTO unit_types (id, name, created_at) VALUES (?, ?, ?)`,
        [newUnitTypeId, name.trim(), new Date().toISOString()]
      );
    } else {
      newUnitTypeId = unitTypeResult.rows[0].id;
    }

    // If unit type changed, check for conflicts
    if (newUnitTypeId !== currentUnitTypeId) {
      const conflict = await db.execute(
        `SELECT id FROM building_unit_types 
         WHERE building_id = ? AND unit_type_id = ? AND id != ?`,
        [building_id, newUnitTypeId, id]
      );

      if (conflict.rows && conflict.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: "This unit type is already configured for this building",
        });
      }
    }

    // Update the configuration
    await db.execute(
      `UPDATE building_unit_types 
       SET unit_type_id = ?, monthly_rent = ?
       WHERE id = ?`,
      [newUnitTypeId, monthly_rent, id]
    );

    // Return updated record
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
      [id]
    );

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error updating unit type:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update unit type",
      error: err.message,
    });
  }
};
