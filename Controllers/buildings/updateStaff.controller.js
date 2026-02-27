import { db } from "../../config/db.js";

export const updateStaff = async (req, res) => {
  const { id } = req.params;
  const { role, name, phone, email, address } = req.body;

  try {
    await db.execute(
      `UPDATE building_management 
       SET role = ?, name = ?, phone = ?, email = ?, address = ?
       WHERE id = ?`,
      [role, name, phone, email, address, id]
    );

    res.json({ message: "Staff member updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
