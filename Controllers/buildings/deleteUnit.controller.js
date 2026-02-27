import { db } from "../../config/db.js";

export const deleteUnit = async (req, res) => {
  const { id } = req.params;

  try {
    await db.execute(`DELETE FROM units WHERE id = ?`, [id]);
    res.json({ message: "Unit deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
