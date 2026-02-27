// backend/routes/settingsRoutes.js
import express from "express";
import { getBuildingsWithUnitTypes } from "./../../Controllers/settings/getBuildingWithUnitTypes.controller.js";
import { getBuildingWithUnitTypesId } from "./../../Controllers/settings/getBuildingWithUnitTypes.contoller.js";
import { getGlobalUnitTypes } from "./../../Controllers/settings/getGlobalUnitTypes.controller.js";

const userSettingsRouter = express.Router();

// Get all buildings with their unit types
userSettingsRouter.get("/buildings-with-unit-types", getBuildingsWithUnitTypes);

// Get single building with unit types
userSettingsRouter.get("/buildings/:id/unit-types", getBuildingWithUnitTypesId);

// Global unit types management
userSettingsRouter.get("/unit-types", getGlobalUnitTypes);

export default userSettingsRouter;
