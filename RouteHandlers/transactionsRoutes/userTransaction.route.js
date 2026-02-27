// transactionRoutes.js
import express from "express";

import { fetchMonthlyTransactions } from "./../../Controllers/transactions/monthlyTransactions.controller.js";
import { getPreviousMonthAdvance } from "./../../Controllers/transactions/previousAdvance.controller.js";
import { getTenantTransactions } from "../../Controllers/transactions/fetchAllData.controller.js";

const userTransactionRouter = express.Router();

// Get monthly transactions for all tenants
userTransactionRouter.get(
  "/transactions/getTransactions/monthly",
  fetchMonthlyTransactions,
);

// Get previous month's advance for a specific tenant
userTransactionRouter.get(
  "/transactions/advance/:tenantId",
  getPreviousMonthAdvance,
);

// Get all transactions for a specific tenant
userTransactionRouter.get("/tenant/:tenantId", getTenantTransactions);

export default userTransactionRouter;
