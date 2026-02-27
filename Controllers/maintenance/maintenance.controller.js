import { v4 as uuidv4 } from "uuid";
import { db } from "../../config/db.js";

/**
 * GET /api/v1/maintenance
 * Get all maintenance requests with filters
 */
export const getMaintenanceRequests = async (req, res, next) => {
  const { buildingId, status, priority, startDate, endDate } = req.query;

  try {
    let query = `
      SELECT 
        mr.id,
        mr.issue_title,
        mr.description,
        mr.priority,
        mr.status,
        mr.cost,
        mr.assigned_to,
        mr.date,
        mr.month,
        mr.year,
        mr.created_at,
        mr.updated_at,
        mr.completed_at,
        t.id as tenant_id,
        t.name as tenant_name,
        t.mobile as tenant_mobile,
        b.id as building_id,
        b.name as building_name,
        b.icon as building_icon,
        u.id as unit_id,
        u.unit_number
      FROM maintenance_requests mr
      LEFT JOIN tenants t ON mr.tenant_id = t.id
      INNER JOIN buildings b ON mr.building_id = b.id
      INNER JOIN units u ON mr.unit_id = u.id
      WHERE 1=1
    `;

    const args = [];

    if (buildingId) {
      query += ` AND mr.building_id = ?`;
      args.push(buildingId);
    }
    if (status) {
      query += ` AND mr.status = ?`;
      args.push(status);
    }
    if (priority) {
      query += ` AND mr.priority = ?`;
      args.push(priority);
    }
    if (startDate) {
      query += ` AND mr.date >= ?`;
      args.push(startDate);
    }
    if (endDate) {
      query += ` AND mr.date <= ?`;
      args.push(endDate);
    }

    query += ` ORDER BY 
      CASE mr.priority 
        WHEN 'high' THEN 1 
        WHEN 'medium' THEN 2 
        WHEN 'low' THEN 3 
      END,
      mr.created_at DESC`;

    const result = await db.execute({ sql: query, args });

    const summary = {
      total: result.rows.length,
      pending: result.rows.filter((r) => r.status === "pending").length,
      in_progress: result.rows.filter((r) => r.status === "in_progress").length,
      completed: result.rows.filter((r) => r.status === "completed").length,
      cancelled: result.rows.filter((r) => r.status === "cancelled").length,
      totalCost: result.rows.reduce((sum, r) => sum + (Number(r.cost) || 0), 0),
      byPriority: {
        high: result.rows.filter((r) => r.priority === "high").length,
        medium: result.rows.filter((r) => r.priority === "medium").length,
        low: result.rows.filter((r) => r.priority === "low").length,
      },
    };

    res.status(200).json({
      success: true,
      data: result.rows,
      summary,
    });
  } catch (err) {
    console.error("Error fetching maintenance requests:", err);
    next(err);
  }
};

/**
 * POST /api/v1/maintenance
 * Create a new maintenance request
 */
export const createMaintenanceRequest = async (req, res, next) => {
  const {
    tenantId,
    buildingId,
    unitId,
    issueTitle,
    description,
    priority,
    assignedTo,
  } = req.body;

  try {
    if (!buildingId || !unitId || !issueTitle || !priority) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    if (!["low", "medium", "high"].includes(priority)) {
      return res.status(400).json({
        success: false,
        message: "Invalid priority value",
      });
    }

    const id = uuidv4();
    const date = new Date().toISOString().split("T")[0];
    const month = new Date().toLocaleString("default", { month: "long" });
    const year = new Date().getFullYear();

    await db.execute({
      sql: `
        INSERT INTO maintenance_requests (
          id, tenant_id, building_id, unit_id, issue_title, 
          description, priority, status, assigned_to, date, month, year
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
      `,
      args: [
        id,
        tenantId || null,
        buildingId,
        unitId,
        issueTitle,
        description || null,
        priority,
        assignedTo || null,
        date,
        month,
        year,
      ],
    });

    // Fetch with LEFT JOIN
    const result = await db.execute({
      sql: `
        SELECT 
          mr.*,
          t.name as tenant_name,
          t.mobile as tenant_mobile,
          b.name as building_name,
          b.icon as building_icon,
          u.unit_number
        FROM maintenance_requests mr
        LEFT JOIN tenants t ON mr.tenant_id = t.id
        INNER JOIN buildings b ON mr.building_id = b.id
        INNER JOIN units u ON mr.unit_id = u.id
        WHERE mr.id = ?
      `,
      args: [id],
    });

    if (result.rows.length === 0) {
      throw new Error("Failed to retrieve created request");
    }

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Maintenance request created successfully",
    });
  } catch (err) {
    console.error("Error creating maintenance request:", err);
    next(err);
  }
};

/**
 * PATCH /api/v1/maintenance/:id/status
 * Update maintenance request status
 */
export const updateMaintenanceStatus = async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    if (
      !status ||
      !["pending", "in_progress", "completed", "cancelled"].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value",
      });
    }

    await db.execute({
      sql: `UPDATE maintenance_requests SET status = ? WHERE id = ?`,
      args: [status, id],
    });

    // Fetch with LEFT JOIN
    const result = await db.execute({
      sql: `
        SELECT 
          mr.*,
          t.name as tenant_name,
          b.name as building_name,
          u.unit_number
        FROM maintenance_requests mr
        LEFT JOIN tenants t ON mr.tenant_id = t.id
        INNER JOIN buildings b ON mr.building_id = b.id
        INNER JOIN units u ON mr.unit_id = u.id
        WHERE mr.id = ?
      `,
      args: [id],
    });

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Maintenance request not found",
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
      message: "Status updated successfully",
    });
  } catch (err) {
    console.error("Error updating maintenance status:", err);
    next(err);
  }
};

/**
 * GET /api/v1/maintenance/expenses
 * Get all maintenance expenses (with optional building filter)
 */
export const getAllMaintenanceExpenses = async (req, res, next) => {
  const { buildingId } = req.query;

  try {
    let query = `
      SELECT 
        me.id,
        me.maintenance_request_id,
        me.description,
        me.category,          
        me.amount,
        me.paid_by,
        me.payment_method,
        me.receipt_number,
        me.date,
        me.created_at,
        mr.issue_title,
        b.id as building_id,
        b.name as building_name,
        u.unit_number
      FROM maintenance_expenses me
      INNER JOIN maintenance_requests mr ON me.maintenance_request_id = mr.id
      INNER JOIN buildings b ON mr.building_id = b.id
      INNER JOIN units u ON mr.unit_id = u.id
      WHERE 1=1
    `;

    const args = [];

    if (buildingId) {
      query += ` AND mr.building_id = ?`;
      args.push(buildingId);
    }

    query += ` ORDER BY me.date DESC`;

    const result = await db.execute({ sql: query, args });

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error("Error fetching all maintenance expenses:", err);
    next(err);
  }
};

/**
 * POST /api/v1/maintenance/:id/expenses
 * Add an expense to a specific maintenance request
 */
export const addMaintenanceExpense = async (req, res, next) => {
  const { id } = req.params;
  const {
    description,
    amount,
    paidBy,
    paymentMethod,
    receiptNumber,
    category, // ✅ added
  } = req.body;

  try {
    if (!description || !amount) {
      return res.status(400).json({
        success: false,
        message: "Description and amount are required",
      });
    }

    const expenseId = uuidv4();
    const date = new Date().toISOString().split("T")[0];

    await db.execute({
      sql: `
        INSERT INTO maintenance_expenses (
          id,
          maintenance_request_id,
          description,
          category,
          amount,
          paid_by,
          payment_method,
          receipt_number,
          date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        expenseId,
        id,
        description,
        category || "Other", // ✅ fallback
        Number(amount),
        paidBy || null,
        paymentMethod || null,
        receiptNumber || null,
        date,
      ],
    });

    //Update total cost
    const totalResult = await db.execute({
      sql: `
        SELECT SUM(amount) as total 
        FROM maintenance_expenses 
        WHERE maintenance_request_id = ?
      `,
      args: [id],
    });

    const totalCost = totalResult.rows[0]?.total || 0;

    await db.execute({
      sql: `
        UPDATE maintenance_requests 
        SET cost = ? 
        WHERE id = ?
      `,
      args: [totalCost, id],
    });

    res.status(201).json({
      success: true,
      message: "Expense added successfully",
      data: {
        id: expenseId,
        totalCost,
        category: category || "Other", // ✅ return it too
      },
    });
  } catch (err) {
    console.error("Error adding maintenance expense:", err);
    next(err);
  }
};

/**
 * PATCH /api/v1/maintenance/:id
 * Update a maintenance request
 */
export const updateMaintenanceRequest = async (req, res, next) => {
  const { id } = req.params;
  const { issueTitle, description, priority, cost, assignedTo } = req.body;

  try {
    const updates = [];
    const args = [];

    if (issueTitle !== undefined) {
      updates.push("issue_title = ?");
      args.push(issueTitle);
    }

    if (description !== undefined) {
      updates.push("description = ?");
      args.push(description);
    }

    if (priority !== undefined) {
      if (!["low", "medium", "high"].includes(priority)) {
        return res.status(400).json({
          success: false,
          message: "Invalid priority",
        });
      }
      updates.push("priority = ?");
      args.push(priority);
    }

    if (cost !== undefined) {
      updates.push("cost = ?");
      args.push(Number(cost) || 0);
    }

    if (assignedTo !== undefined) {
      updates.push("assigned_to = ?");
      args.push(assignedTo);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    args.push(id);

    await db.execute({
      sql: `UPDATE maintenance_requests SET ${updates.join(", ")} WHERE id = ?`,
      args,
    });

    // Fetch updated request
    const result = await db.execute({
      sql: `
        SELECT 
          mr.*,
          t.name as tenant_name,
          b.name as building_name,
          u.unit_number
        FROM maintenance_requests mr
        LEFT JOIN tenants t ON mr.tenant_id = t.id
        INNER JOIN buildings b ON mr.building_id = b.id
        INNER JOIN units u ON mr.unit_id = u.id
        WHERE mr.id = ?
      `,
      args: [id],
    });

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Maintenance request not found",
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
      message: "Maintenance request updated successfully",
    });
  } catch (err) {
    console.error("Error updating maintenance request:", err);
    next(err);
  }
};

/**
 * DELETE /api/v1/maintenance/:id
 * Delete a maintenance request
 */
export const deleteMaintenanceRequest = async (req, res, next) => {
  const { id } = req.params;

  try {
    await db.execute({
      sql: `DELETE FROM maintenance_requests WHERE id = ?`,
      args: [id],
    });

    res.status(200).json({
      success: true,
      message: "Maintenance request deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting maintenance request:", err);
    next(err);
  }
};

/**
 * GET /api/v1/maintenance/:id/expenses
 * Get expenses for a maintenance request
 */
export const getMaintenanceExpenses = async (req, res, next) => {
  const { id } = req.params;

  try {
    const result = await db.execute({
      sql: `
        SELECT 
          id,
          maintenance_request_id,
          description,
          category,          
          amount,
          paid_by,
          payment_method,
          receipt_number,
          date,
          created_at
        FROM maintenance_expenses
        WHERE maintenance_request_id = ?
        ORDER BY date DESC
      `,
      args: [id],
    });

    const total = result.rows.reduce(
      (sum, exp) => sum + (Number(exp.amount) || 0),
      0,
    );

    res.status(200).json({
      success: true,
      data: result.rows,
      summary: {
        total,
        count: result.rows.length,
      },
    });
  } catch (err) {
    console.error("Error fetching maintenance expenses:", err);
    next(err);
  }
};

/**
 * PATCH /api/v1/maintenance/expenses/:expenseId
 * Update a maintenance expense
 */
export const updateMaintenanceExpense = async (req, res, next) => {
  const { expenseId } = req.params;
  const {
    description,
    category,
    amount,
    paidBy,
    paymentMethod,
    receiptNumber,
  } = req.body;

  try {
    const updates = [];
    const args = [];

    if (description !== undefined) {
      updates.push("description = ?");
      args.push(description);
    }

    if (category !== undefined) {
      updates.push("category = ?");
      args.push(category);
    }

    if (amount !== undefined) {
      updates.push("amount = ?");
      args.push(Number(amount));
    }

    if (paidBy !== undefined) {
      updates.push("paid_by = ?");
      args.push(paidBy);
    }

    if (paymentMethod !== undefined) {
      updates.push("payment_method = ?");
      args.push(paymentMethod);
    }

    if (receiptNumber !== undefined) {
      updates.push("receipt_number = ?");
      args.push(receiptNumber);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    args.push(expenseId);

    await db.execute({
      sql: `UPDATE maintenance_expenses SET ${updates.join(", ")} WHERE id = ?`,
      args,
    });

    // Fetch updated expense
    const result = await db.execute({
      sql: `
        SELECT 
          id,
          maintenance_request_id,
          description,
          category,
          amount,
          paid_by,
          payment_method,
          receipt_number,
          date,
          created_at
        FROM maintenance_expenses
        WHERE id = ?
      `,
      args: [expenseId],
    });

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    // Update total cost in maintenance request
    const requestId = result.rows[0].maintenance_request_id;
    const totalResult = await db.execute({
      sql: `
        SELECT SUM(amount) as total 
        FROM maintenance_expenses 
        WHERE maintenance_request_id = ?
      `,
      args: [requestId],
    });

    const totalCost = totalResult.rows[0]?.total || 0;

    await db.execute({
      sql: `
        UPDATE maintenance_requests 
        SET cost = ? 
        WHERE id = ?
      `,
      args: [totalCost, requestId],
    });

    res.status(200).json({
      success: true,
      data: result.rows[0],
      totalCost,
      message: "Expense updated successfully",
    });
  } catch (err) {
    console.error("Error updating maintenance expense:", err);
    next(err);
  }
};

/**
 * DELETE /api/v1/maintenance/expenses/:expenseId
 * Delete a maintenance expense
 */
export const deleteMaintenanceExpense = async (req, res, next) => {
  const { expenseId } = req.params;

  try {
    // Fetch request ID before delete
    const expenseResult = await db.execute({
      sql: `SELECT maintenance_request_id FROM maintenance_expenses WHERE id = ?`,
      args: [expenseId],
    });

    if (expenseResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    const requestId = expenseResult.rows[0].maintenance_request_id;

    await db.execute({
      sql: `DELETE FROM maintenance_expenses WHERE id = ?`,
      args: [expenseId],
    });

    // Update total cost
    const totalResult = await db.execute({
      sql: `
        SELECT SUM(amount) as total 
        FROM maintenance_expenses 
        WHERE maintenance_request_id = ?
      `,
      args: [requestId],
    });

    const totalCost = totalResult.rows[0]?.total || 0;

    await db.execute({
      sql: `
        UPDATE maintenance_requests 
        SET cost = ? 
        WHERE id = ?
      `,
      args: [totalCost, requestId],
    });

    res.status(200).json({
      success: true,
      totalCost,
      message: "Expense deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting maintenance expense:", err);
    next(err);
  }
};
