import dotenv from "dotenv";
dotenv.config();

export const {
  TURSO_URL,
  TURSO_API,
  PORT,
  ACCESS_TOKEN,
  REFRESH_TOKEN,
  GEMINI_API_KEY,
  RESEND_API_KEY,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
} = process.env;
