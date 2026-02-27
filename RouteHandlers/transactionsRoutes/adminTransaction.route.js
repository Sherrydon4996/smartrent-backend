// transactionRoutes.js
import express from "express";

import { deleteTransaction } from "./../../Controllers/transactions/deleteTransaction.controller.js";
import { settlePaymentWithAdvance } from "./../../Controllers/transactions/setlePayment.controller.js";
import { upsertTransaction } from "./../../Controllers/transactions/upsertTransaction.controller.js";

const adminTransactionRouter = express.Router();

// Upsert transaction (create or update)
adminTransactionRouter.post("/transactions/upsert", upsertTransaction);

// Delete a transaction
adminTransactionRouter.delete("/:id", deleteTransaction);

adminTransactionRouter.post("/transactions/settle", settlePaymentWithAdvance);

export default adminTransactionRouter;
