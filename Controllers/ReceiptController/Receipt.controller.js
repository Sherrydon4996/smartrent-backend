// controllers/receipts/receiptController.js
import twilio from "twilio";
import {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  RESEND_API_KEY,
} from "../../config/env.js";

import { Resend } from "resend"; // npm install resend
const TWILIO_PHONE_NUMBERb = "0711140899";

const resend = new Resend(RESEND_API_KEY);

// Twilio setup (no legal docs required, instant activation)
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

/**
 * Send receipt via email
 * @route POST /api/v1/admin/receipts/send-email
 */
export const sendReceiptEmail = async (req, res, next) => {
  try {
    const { email, tenantName, month, year, receiptData } = req.body;

    if (!email || !receiptData) {
      return res.status(400).json({
        success: false,
        message: "Email and receipt data are required",
      });
    }

    // Generate HTML email template
    const emailHtml = generateReceiptEmailHTML(
      tenantName,
      month,
      year,
      receiptData,
    );

    // Send email using Resend (recommended - free tier)
    const emailResponse = await resend.emails.send({
      from: "SmartRent Manager <onboarding@resend.dev>",
      to: email,
      subject: `Payment Receipt - ${month} ${year} - ${receiptData.receiptNo}`,
      html: emailHtml,
    });

    res.status(200).json({
      success: true,
      message: "Receipt sent successfully via email",
      emailId: emailResponse.id,
    });
  } catch (error) {
    console.error("Email send error:", error);
    next(error);
  }
};

/**
 * Send receipt via SMS using Twilio
 * @route POST /api/v1/admin/receipts/send-sms
 */
export const sendReceiptSMS = async (req, res, next) => {
  try {
    const {
      phone,
      tenantName,
      month,
      year,
      amountPaid,
      balanceDue,
      receiptNo,
    } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    // Format phone number to international format (+254...)
    let formattedPhone = phone.trim().replace(/\s/g, "");
    if (formattedPhone.startsWith("0")) {
      formattedPhone = "+254" + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith("254")) {
      formattedPhone = "+" + formattedPhone;
    } else if (!formattedPhone.startsWith("+")) {
      formattedPhone = "+" + formattedPhone;
    }

    // Generate SMS message (keep under 160 characters for single SMS)
    const shortReceiptNo = receiptNo.slice(-8);
    const balanceText =
      balanceDue > 0
        ? ` Bal: KES ${balanceDue.toLocaleString()}.`
        : " Paid in full!";

    const message = `SmartRent Receipt #${shortReceiptNo} - ${tenantName}. Paid: KES ${amountPaid.toLocaleString()} for ${month} ${year}.${balanceText}`;

    // Send SMS using Twilio
    const smsResponse = await twilioClient.messages.create({
      body: message,
      from: TWILIO_PHONE_NUMBER,
      to: formattedPhone,
    });

    // Calculate approximate cost
    // Twilio Kenya SMS: ~$0.05 USD = ~KES 6.50 (at current rates)
    const estimatedCostUSD = 0.05;
    const estimatedCostKES = (estimatedCostUSD * 130).toFixed(2); // ~130 KES per USD

    res.status(200).json({
      success: true,
      message: "Receipt sent successfully via SMS",
      smsId: smsResponse.sid,
      cost: parseFloat(estimatedCostKES),
      costCurrency: "KES",
      recipient: formattedPhone,
      status: smsResponse.status,
    });
  } catch (error) {
    console.error("SMS send error:", error);

    // Better error messages for common Twilio errors
    let errorMessage = "Failed to send SMS. Please try again.";

    if (error.code === 21211) {
      errorMessage = "Invalid phone number format.";
    } else if (error.code === 21408) {
      errorMessage = "Phone number is not reachable.";
    } else if (error.code === 21614) {
      errorMessage = "Invalid 'To' phone number.";
    } else if (error.message) {
      errorMessage = error.message;
    }

    return res.status(400).json({
      success: false,
      message: errorMessage,
      error: error.code || "SMS_SEND_ERROR",
    });
  }
};

/**
 * Generate HTML email template for receipt
 */
function generateReceiptEmailHTML(tenantName, month, year, receiptData) {
  const {
    receiptNo,
    monthlyRent,
    waterBill,
    garbageBill,
    penalties,
    totalDue,
    amountPaid,
    balanceDue,
    houseNumber,
    buildingName,
  } = receiptData;

  const currentDate = new Date().toLocaleDateString("en-KE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Receipt</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0; font-size: 28px;">SmartRent Manager</h1>
        <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Payment Receipt</p>
      </div>
      
      <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
        <div style="text-align: right; color: #666; font-size: 14px; margin-bottom: 20px;">
          <strong>Receipt No:</strong> ${receiptNo}<br>
          <strong>Date:</strong> ${currentDate}
        </div>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="margin: 0 0 15px 0; color: #667eea; font-size: 18px;">Tenant Details</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666;">Name:</td>
              <td style="padding: 8px 0; font-weight: bold; text-align: right;">${tenantName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">House Number:</td>
              <td style="padding: 8px 0; font-weight: bold; text-align: right;">${houseNumber}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Building:</td>
              <td style="padding: 8px 0; font-weight: bold; text-align: right;">${buildingName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Period:</td>
              <td style="padding: 8px 0; font-weight: bold; text-align: right;">${month} ${year}</td>
            </tr>
          </table>
        </div>
        
        <div style="margin-bottom: 20px;">
          <h2 style="margin: 0 0 15px 0; color: #667eea; font-size: 18px;">Payment Breakdown</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 10px 0; color: #666;">Monthly Rent:</td>
              <td style="padding: 10px 0; font-weight: bold; text-align: right;">KES ${monthlyRent.toLocaleString()}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 10px 0; color: #666;">Water Bill:</td>
              <td style="padding: 10px 0; font-weight: bold; text-align: right;">KES ${waterBill.toLocaleString()}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 10px 0; color: #666;">Garbage Fee:</td>
              <td style="padding: 10px 0; font-weight: bold; text-align: right;">KES ${garbageBill.toLocaleString()}</td>
            </tr>
            ${
              penalties > 0
                ? `
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 10px 0; color: #dc3545;">Penalties:</td>
              <td style="padding: 10px 0; font-weight: bold; text-align: right; color: #dc3545;">KES ${penalties.toLocaleString()}</td>
            </tr>
            `
                : ""
            }
            <tr style="border-top: 2px solid #667eea;">
              <td style="padding: 15px 0; font-weight: bold; font-size: 16px;">Total Due:</td>
              <td style="padding: 15px 0; font-weight: bold; font-size: 16px; text-align: right;">KES ${totalDue.toLocaleString()}</td>
            </tr>
          </table>
        </div>
        
        <div style="background: ${balanceDue > 0 ? "#fff3cd" : "#d4edda"}; padding: 20px; border-radius: 8px; border: 2px solid ${balanceDue > 0 ? "#ffc107" : "#28a745"};">
          <table style="width: 100%;">
            <tr>
              <td style="padding: 5px 0; font-size: 18px; font-weight: bold;">Amount Paid:</td>
              <td style="padding: 5px 0; font-size: 24px; font-weight: bold; text-align: right; color: #28a745;">KES ${amountPaid.toLocaleString()}</td>
            </tr>
            ${
              balanceDue > 0
                ? `
            <tr>
              <td style="padding: 5px 0; color: #856404;">Balance Remaining:</td>
              <td style="padding: 5px 0; font-weight: bold; text-align: right; color: #856404;">KES ${balanceDue.toLocaleString()}</td>
            </tr>
            `
                : ""
            }
          </table>
        </div>
        
        <div style="text-align: center; margin-top: 30px; padding: 20px; background: ${balanceDue > 0 ? "#ffc107" : "#28a745"}; color: white; border-radius: 8px; font-weight: bold; font-size: 18px;">
          ${balanceDue > 0 ? `⚠ PARTIAL PAYMENT - Balance: KES ${balanceDue.toLocaleString()}` : "✓ FULLY PAID"}
        </div>
      </div>
      
      <div style="background: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; color: #666; font-size: 14px;">
        <p style="margin: 0 0 10px 0;">Thank you for your payment!</p>
        <p style="margin: 0 0 10px 0; font-weight: bold;">SmartRent Manager</p>
        <p style="margin: 0; font-size: 12px; opacity: 0.7;">This is an automated email. Please do not reply.</p>
      </div>
    </body>
    </html>
  `;
}
