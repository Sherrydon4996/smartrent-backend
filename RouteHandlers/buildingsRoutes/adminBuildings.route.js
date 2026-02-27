import express from "express";
import { createBuilding } from "./../../Controllers/buildings/createBuilding.controller.js";
import { updateBuilding } from "./../../Controllers/buildings/updateBuilding.controller.js";
import { deleteBuilding } from "./../../Controllers/buildings/deleteBuilding.controller.js";
import { createUnit } from "./../../Controllers/buildings/createUnit.controller.js";
import { updateUnit } from "./../../Controllers/buildings/updateUnit.controller.js";
import { deleteUnit } from "./../../Controllers/buildings/deleteUnit.controller.js";
import { createStaff } from "./../../Controllers/buildings/createStaff.controller.js";
import { updateStaff } from "./../../Controllers/buildings/updateStaff.controller.js";
import { deleteStaff } from "./../../Controllers/buildings/deleteStaff.controller.js";

const adminBuildingRouter = express.Router();

// Building routes

adminBuildingRouter.post("/", createBuilding);
adminBuildingRouter.put("/:id", updateBuilding);
adminBuildingRouter.delete("/:id", deleteBuilding);

// Unit routes

adminBuildingRouter.post("/units", createUnit);
adminBuildingRouter.put("/units/:id", updateUnit);
adminBuildingRouter.delete("/units/:id", deleteUnit);

// Staff routes

adminBuildingRouter.post("/staff", createStaff);
adminBuildingRouter.put("/staff/:id", updateStaff);
adminBuildingRouter.delete("/staff/:id", deleteStaff);

export default adminBuildingRouter;
