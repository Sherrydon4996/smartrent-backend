// database/schema.js

import { db } from "../../config/db.js";

export const deleteTenant = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Tenant ID is required",
      });
    }

    // Check if tenant exists and get their unit info
    const checkResult = await db.execute({
      sql: "SELECT id, buildingName, houseNumber FROM tenants WHERE id = ?",
      args: [id],
    });

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found",
      });
    }

    const tenant = checkResult.rows[0];

    // Find and vacate the unit
    const unitResult = await db.execute({
      sql: `
        SELECT u.id 
        FROM units u
        JOIN buildings b ON u.building_id = b.id
        WHERE b.name = ? AND u.unit_number = ?
        LIMIT 1
      `,
      args: [tenant.buildingName, tenant.houseNumber],
    });

    if (unitResult.rows.length > 0) {
      await db.execute({
        sql: `
          UPDATE units 
          SET is_occupied = 0, 
              tenant_name = NULL, 
              tenant_phone = NULL
          WHERE id = ?
        `,
        args: [unitResult.rows[0].id],
      });
    }

    // Delete the tenant
    await db.execute({
      sql: "DELETE FROM tenants WHERE id = ?",
      args: [id],
    });

    res.status(200).json({
      success: true,
      message: "Tenant deleted successfully",
    });
  } catch (err) {
    next(err);
  }
};
