// routes/receiptRoutes.js

import express from "express";
import {
  sendReceiptEmail,
  sendReceiptSMS,
} from "../../Controllers/ReceiptController/Receipt.controller.js";

const SMSrouter = express.Router();

// POST /api/v1/receipts/send-email
SMSrouter.post("/send-email", sendReceiptEmail);

// POST /api/v1/receipts/send-sms
SMSrouter.post("/send-sms", sendReceiptSMS);

export default SMSrouter;
