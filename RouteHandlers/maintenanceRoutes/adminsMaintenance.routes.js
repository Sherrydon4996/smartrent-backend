import express from "express";
import {
  addMaintenanceExpense,
  createMaintenanceRequest,
  deleteMaintenanceRequest,
  updateMaintenanceRequest,
  updateMaintenanceStatus,
} from "../../Controllers/maintenance/maintenance.controller.js";

const adminMaintenanceRouter = express.Router();

adminMaintenanceRouter.post("/", createMaintenanceRequest);
adminMaintenanceRouter.patch("/:id/status", updateMaintenanceStatus);
adminMaintenanceRouter.patch("/:id", updateMaintenanceRequest);
adminMaintenanceRouter.delete("/:id", deleteMaintenanceRequest);
adminMaintenanceRouter.post("/:id/expenses", addMaintenanceExpense);

export default adminMaintenanceRouter;
