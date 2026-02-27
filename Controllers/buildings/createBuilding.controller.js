import { db } from "../../config/db.js";

export const createBuilding = async (req, res) => {
  const { id, name, type, city, wifi_installed, icon } = req.body;

  if (!name || !city) {
    return res.status(400).json({ error: "Name and city are required" });
  }

  try {
    const buildingId = id || `bld_${Date.now()}`;
    await db.execute(
      `INSERT INTO buildings (id, name, type, city, wifi_installed,icon, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        buildingId,
        name,
        type || "residential",
        city,
        wifi_installed ? 1 : 0,
        icon,
        new Date().toISOString(),
      ]
    );

    res.json({
      message: "Building created successfully",
      id: buildingId,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
