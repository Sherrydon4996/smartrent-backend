import { db } from "../../config/db.js";

export const createStaff = async (req, res) => {
  const { id, building_id, role, name, phone, email, address } = req.body;

  if (!building_id || !role || !name) {
    return res
      .status(400)
      .json({ error: "Building ID, role, and name are required" });
  }

  try {
    const staffId = id || `staff_${Date.now()}`;
    await db.execute(
      `INSERT INTO building_management (id, building_id, role, name, phone, email, address, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        staffId,
        building_id,
        role,
        name,
        phone || "",
        email || "",
        address || "",
        new Date().toISOString(),
      ]
    );

    res.json({
      message: "Staff member created successfully",
      id: staffId,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
