// controllers/portfolio/portfolioAI.controller.js

import { GEMINI_API_KEY } from "../../config/env.js";

/**
 * Build conversation history for Gemini API
 */
const buildConversationHistory = (history) => {
  if (!history || !Array.isArray(history) || history.length === 0) {
    return [];
  }

  // Take last 8 messages for context
  return history.slice(-8).map((msg) => ({
    role: msg.role === "user" ? "user" : "model",
    parts: [{ text: msg.text }],
  }));
};

/**
 * Process portfolio AI query
 * @route POST /api/v1/portfolio/ai/query
 */
export const processPortfolioQuery = async (req, res, next) => {
  try {
    const { query, businessData, conversationHistory } = req.body;

    // Validate required fields
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Query is required",
      });
    }

    if (!businessData || typeof businessData !== "string") {
      return res.status(400).json({
        success: false,
        message: "Business data is required",
      });
    }

    // Validate query length
    if (query.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Query is too long (max 1000 characters)",
      });
    }

    // Check if API key is configured
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "AI service is not configured",
      });
    }

    // Generate system prompt
    const systemPrompt = `
You are HarryBot, an AI assistant for HarryTech Services.

BUSINESS CONTEXT:
${businessData}

RULES:
- ONLY use the information above
- Do NOT guess or fabricate details
- If unsure, say you don't have that information
- Be clear, accurate, and professional
- Default to 4-6 sentences
- Use bullet points for services or explanations
- Encourage WhatsApp contact: +254711140899
- Emojis: minimal and professional
`;

    // Build conversation history
    const history = buildConversationHistory(conversationHistory);

    // Call Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: systemPrompt }],
            },
            ...history,
            {
              role: "user",
              parts: [{ text: query }],
            },
          ],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 900,
            topP: 0.9,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Gemini API Error:", errorData);

      if (response.status === 429) {
        return res.status(429).json({
          success: false,
          message:
            "AI service temporarily unavailable due to high demand. Please try again later.",
        });
      }

      if (response.status === 400) {
        return res.status(400).json({
          success: false,
          message: "Invalid request format",
        });
      }

      return res.status(500).json({
        success: false,
        message: "AI service error. Please try again later.",
      });
    }

    const data = await response.json();

    // Extract text from Gemini response
    const aiResponse =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "I'm unable to respond right now. Please contact us via WhatsApp 📱.";

    res.status(200).json({
      success: true,
      response: aiResponse,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error processing portfolio AI query:", error);

    // Generic error response
    res.status(500).json({
      success: false,
      message:
        "⚠️ I'm having technical issues right now. Please reach us on WhatsApp (+254711140899) or email for quick help.",
    });
  }
};

/**
 * Health check endpoint
 * @route GET /api/v1/portfolio/ai/health
 */
export const healthCheck = async (req, res) => {
  res.status(200).json({
    success: true,
    status: "Portfolio AI service is running",
    timestamp: new Date().toISOString(),
  });
};
