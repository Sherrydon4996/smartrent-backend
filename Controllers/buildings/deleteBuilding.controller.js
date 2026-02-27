import { db } from "../../config/db.js";

export const deleteBuilding = async (req, res) => {
  const { id } = req.params;

  try {
    // Delete building (CASCADE will delete units and staff)
    await db.execute(`DELETE FROM buildings WHERE id = ?`, [id]);
    res.json({ message: "Building deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
