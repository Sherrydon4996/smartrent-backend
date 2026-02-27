import { Router } from "express";
import { createTenant } from "../../Controllers/tenants/addtenant.controller.js";
import { updateTenant } from "../../Controllers/tenants/updateTenant.controller.js";
import { deleteTenant } from "../../Controllers/tenants/deleteTeanant.controller.js";

const tenantAdminsRoute = Router();

tenantAdminsRoute.post("/addNewTenant", createTenant);
tenantAdminsRoute.put("/updateTenant/:tenantId", updateTenant);
tenantAdminsRoute.delete("/deleteTenant/:id", deleteTenant);

export default tenantAdminsRoute;
