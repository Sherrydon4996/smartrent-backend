// routes/maintenanceRoutes.js
import express from "express";
import {
  getAllMaintenanceExpenses,
  getMaintenanceExpenses,
  getMaintenanceRequests,
} from "./../../Controllers/maintenance/maintenance.controller.js";

const userMaintenanceRouter = express.Router();

userMaintenanceRouter.get("/", getMaintenanceRequests);

userMaintenanceRouter.get("/:id/expenses", getMaintenanceExpenses);
userMaintenanceRouter.get("/expenses", getAllMaintenanceExpenses);

export default userMaintenanceRouter;
