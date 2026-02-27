import { db } from "../../config/db.js";

export const updateBuilding = async (req, res) => {
  const { id } = req.params;
  const { name, type, city, wifi_installed } = req.body;

  try {
    await db.execute(
      `UPDATE buildings 
       SET name = ?, type = ?, city = ?, wifi_installed = ? 
       WHERE id = ?`,
      [name, type, city, wifi_installed ? 1 : 0, id]
    );

    res.json({ message: "Building updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
