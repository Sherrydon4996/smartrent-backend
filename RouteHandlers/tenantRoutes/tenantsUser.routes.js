import { Router } from "express";

import { getAllMonthlyRecords } from "./../../Controllers/tenants/fetchFullMonthlyRecords.controller.js";
import { fetchTenants } from "./../../Controllers/tenants/fetchTenants.controller.js";
import { getTenantMonthlyRecords } from "./../../Controllers/tenants/tenantMonthlyRecords.controller.js";

const tenantUsersRoute = Router();
tenantUsersRoute.get("/:tenantId/monthly-records", getTenantMonthlyRecords);
tenantUsersRoute.get("/getAllMonthlyRecords", getAllMonthlyRecords);
tenantUsersRoute.get("/getTenants", fetchTenants);

export default tenantUsersRoute;
