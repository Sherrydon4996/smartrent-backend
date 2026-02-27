// routes/reportRoutes.js
import express from "express";
import {
  getAnnualSummaryReport,
  getMonthlyIncomeReport,
  getOutstandingBalancesReport,
  getPaymentHistoryReport,
  getTenantBalanceReport,
} from "../Controllers/report/getTenantBalanceReport.controller.js";
import { getMonthlyPaymentsDetail } from "../Controllers/dashboard/getMonthlyPaymentDetails.controller.js";

const reportRouter = express.Router();

reportRouter.get("/tenant-balances", getTenantBalanceReport);
reportRouter.get("/payment-history", getPaymentHistoryReport);
reportRouter.get("/monthly-income", getMonthlyIncomeReport);
reportRouter.get("/outstanding-balances", getOutstandingBalancesReport);
reportRouter.get("/annual-summary", getAnnualSummaryReport);
reportRouter.get("/monthly-payments-detail", getMonthlyPaymentsDetail);

export default reportRouter;
