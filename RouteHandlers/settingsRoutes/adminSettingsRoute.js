// backend/routes/settingsRoutes.js
import express from "express";
import { createGlobalUnitType } from "./../../Controllers/settings/createGlobalUnitType.controller.js";
import { addUnitTypeToBuilding } from "./../../Controllers/settings/addUnitTypeToBuilding.controller.js";
import { updateBuildingUnitType } from "./../../Controllers/settings/updateBuildingUnitType.controller.js";
import { removeUnitTypeFromBuilding } from "./../../Controllers/settings/removeUnitTypeFromBuilding.controller.js";

const adminSettingsRouter = express.Router();

adminSettingsRouter.post("/unit-types", createGlobalUnitType);

// Building unit type configuration
adminSettingsRouter.post("/building-unit-types", addUnitTypeToBuilding);
adminSettingsRouter.put("/building-unit-types/:id", updateBuildingUnitType);
adminSettingsRouter.delete(
  "/building-unit-types/:id",
  removeUnitTypeFromBuilding,
);

export default adminSettingsRouter;
