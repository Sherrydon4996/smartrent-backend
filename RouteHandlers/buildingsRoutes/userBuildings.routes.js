import express from "express";
import { getAllBuildings } from "./../../Controllers/buildings/getBuildings.controller.js";
import { getBuildingById } from "./../../Controllers/buildings/getBuildingById.controller.js";
import { getUnitsByBuilding } from "./../../Controllers/buildings/getUnitsByBuilding.controller.js";
import { getStaffByBuilding } from "./../../Controllers/buildings/getStaffByBuilding.controller.js";

const userBuildingRouter = express.Router();

// Building routes
userBuildingRouter.get("/full", getAllBuildings); // Get all buildings with units and staff
userBuildingRouter.get("/:id", getBuildingById);

// Unit routes
userBuildingRouter.get("/:buildingId/units", getUnitsByBuilding);

// Staff routes
userBuildingRouter.get("/:building_id/staff", getStaffByBuilding);

export default userBuildingRouter;
