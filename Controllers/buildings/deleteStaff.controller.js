import { db } from "../../config/db.js";

export const deleteStaff = async (req, res) => {
  const { id } = req.params;

  try {
    await db.execute(`DELETE FROM building_management WHERE id = ?`, [id]);
    res.json({ message: "Staff member deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
