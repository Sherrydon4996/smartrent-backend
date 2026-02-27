// controllers/ai/aiHelperController.js

import { db } from "../../config/db.js";
import { GEMINI_API_KEY } from "../../config/env.js";

// In-memory conversation storage (you can replace this with Redis or database)
const conversations = new Map();

// Clean up old conversations (older than 1 hour)
setInterval(
  () => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [sessionId, data] of conversations.entries()) {
      if (data.lastActivity < oneHourAgo) {
        conversations.delete(sessionId);
      }
    }
  },
  5 * 60 * 1000,
); // Run every 5 minutes

/**
 * Fetch system context (buildings, units, penalties)
 */
const getSystemContext = async () => {
  try {
    const buildingsResult = await db.execute({
      sql: `SELECT id, name, type, city, wifi_installed, icon FROM buildings`,
      args: [],
    });

    const buildings = [];

    for (const building of buildingsResult.rows) {
      const unitTypesResult = await db.execute({
        sql: `
          SELECT ut.name, but.monthly_rent
          FROM building_unit_types but
          JOIN unit_types ut ON but.unit_type_id = ut.id
          WHERE but.building_id = ?
        `,
        args: [building.id],
      });

      const penaltyResult = await db.execute({
        sql: `SELECT percentage FROM penalties WHERE building_id = ?`,
        args: [building.id],
      });

      const unitsResult = await db.execute({
        sql: `
          SELECT ut.name as unit_type, COUNT(*) as vacant_count
          FROM units u
          JOIN unit_types ut ON u.unit_type_id = ut.id
          WHERE u.building_id = ? AND u.is_occupied = 0
          GROUP BY ut.name
        `,
        args: [building.id],
      });

      const statsResult = await db.execute({
        sql: `
          SELECT 
            COUNT(*) as total_units,
            SUM(is_occupied) as occupied_units
          FROM units
          WHERE building_id = ?
        `,
        args: [building.id],
      });

      buildings.push({
        name: building.name,
        type: building.type,
        city: building.city,
        wifi: building.wifi_installed === 1,
        unitTypes: unitTypesResult.rows.map((ut) => ({
          name: ut.name,
          rent: ut.monthly_rent,
        })),
        penaltyPercentage: penaltyResult.rows[0]?.percentage || 0,
        vacantUnits: unitsResult.rows,
        totalUnits: statsResult.rows[0]?.total_units || 0,
        occupiedUnits: statsResult.rows[0]?.occupied_units || 0,
        vacancyRate:
          statsResult.rows[0]?.total_units > 0
            ? (
                ((statsResult.rows[0].total_units -
                  statsResult.rows[0].occupied_units) /
                  statsResult.rows[0].total_units) *
                100
              ).toFixed(1)
            : 0,
      });
    }

    const tenantsResult = await db.execute({
      sql: `SELECT COUNT(*) as count FROM tenants WHERE status = 'active'`,
      args: [],
    });

    const overdueResult = await db.execute({
      sql: `
        SELECT COUNT(DISTINCT t.id) as count
        FROM tenants t
        JOIN monthly_payments mp ON t.id = mp.tenant_id
        WHERE t.status = 'active' AND mp.balanceDue > 0
      `,
      args: [],
    });

    return {
      buildings,
      totalActiveTenants: tenantsResult.rows[0]?.count || 0,
      totalOverdueTenants: overdueResult.rows[0]?.count || 0,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error fetching system context:", error);
    throw error;
  }
};

/**
 * Generate system prompt with current data
 */
const generateSystemPrompt = (context) => {
  const buildingDetails = context.buildings
    .map(
      (b) => `
Building: ${b.name}
- Type: ${b.type || "N/A"}
- Location: ${b.city || "N/A"}
- WiFi: ${b.wifi ? "Yes" : "No"}
- Late Payment Interest: ${b.penaltyPercentage}% per day
- Total Units: ${b.totalUnits}
- Occupied: ${b.occupiedUnits}
- Vacant: ${b.totalUnits - b.occupiedUnits} (${b.vacancyRate}%)
- Unit Types & Rent:
${b.unitTypes.map((ut) => `  • ${ut.name}: KES ${ut.rent.toLocaleString()}/month`).join("\n")}
- Vacant Units by Type:
${b.vacantUnits.length > 0 ? b.vacantUnits.map((vu) => `  • ${vu.unit_type}: ${vu.vacant_count} available`).join("\n") : "  • All units occupied"}
`,
    )
    .join("\n---\n");

  return `You are a helpful AI assistant for a property management system called SmartRent. Your role is to provide quick, brief, and accurate answers about buildings, units, and rental information.

CURRENT SYSTEM DATA:
${buildingDetails}

SUMMARY STATISTICS:
- Total Active Tenants: ${context.totalActiveTenants}
- Tenants with Overdue Payments: ${context.totalOverdueTenants}

RESPONSE GUIDELINES:
0. remember the due dates for paying rent in all building is date 5 of every month.
1. Keep answers SHORT and BRIEF (2-4 sentences maximum)
2. Use bullet points only when listing multiple items
3. Always mention specific building names when relevant
4. Format currency as "KES X,XXX"
5. Be conversational and friendly
6. If asked about vacant units, list them by building and type with prices
7. If asked about interest/penalties, state the percentage per day for the specific building
8. Only provide information based on the data above
9. If you don't have the information, politely say so
10. Remember previous questions in the conversation to provide contextual answers

EXAMPLE RESPONSES:
User: "Do we have any vacant houses?"
You: "Yes! We have vacant units in [Building Names]. [Building A] has [X] [unit type] at KES [amount]/month. Would you like details on a specific building?"

User: "What's the interest rate in Building A?"
You: "Building A charges [X]% interest per day on late rent payments."

User: "How many tenants do we have?"
You: "We currently have [X] active tenants across all buildings."

Now respond to user queries based on this data.`;
};

/**
 * Build conversation history for Gemini API
 */
const buildConversationHistory = (sessionId) => {
  const conversation = conversations.get(sessionId);
  if (!conversation || !conversation.history.length) {
    return [];
  }

  // Return the conversation history in Gemini format
  return conversation.history.map((msg) => ({
    role: msg.role,
    parts: [{ text: msg.content }],
  }));
};

/**
 * Call Gemini API with conversation history
 */
const callGeminiAPI = async (systemPrompt, userQuery, sessionId) => {
  const conversationHistory = buildConversationHistory(sessionId);

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
          ...conversationHistory,
          {
            role: "user",
            parts: [{ text: userQuery }],
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
      throw new Error("QUOTA_EXCEEDED");
    }

    if (response.status === 400) {
      throw new Error("INVALID_REQUEST");
    }

    throw new Error("API_ERROR");
  }

  const data = await response.json();

  if (
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0]
  ) {
    return data.candidates[0].content.parts[0].text;
  }

  throw new Error("Invalid response format from Gemini API");
};

/**
 * Process AI query with conversation memory
 * @route POST /api/v1/ai/query
 */
export const processAIQuery = async (req, res, next) => {
  try {
    const { query, sessionId } = req.body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Query is required",
      });
    }

    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({
        success: false,
        message: "Session ID is required",
      });
    }

    if (query.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Query is too long (max 500 characters)",
      });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "AI service is not configured",
      });
    }

    // Initialize conversation if it doesn't exist
    if (!conversations.has(sessionId)) {
      conversations.set(sessionId, {
        history: [],
        lastActivity: Date.now(),
      });
    }

    // Get current system context
    const context = await getSystemContext();
    const systemPrompt = generateSystemPrompt(context);

    // Call Gemini API with conversation history
    const aiResponse = await callGeminiAPI(systemPrompt, query, sessionId);

    // Update conversation history
    const conversation = conversations.get(sessionId);
    conversation.history.push(
      { role: "user", content: query },
      { role: "model", content: aiResponse },
    );
    conversation.lastActivity = Date.now();

    // Limit history to last 10 exchanges (20 messages)
    if (conversation.history.length > 20) {
      conversation.history = conversation.history.slice(-20);
    }

    res.status(200).json({
      success: true,
      response: aiResponse.trim(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error processing AI query:", error);

    if (error.message === "QUOTA_EXCEEDED") {
      return res.status(429).json({
        success: false,
        message: "AI service temporarily unavailable due to high demand",
      });
    }

    if (error.message === "INVALID_REQUEST") {
      return res.status(400).json({
        success: false,
        message: "Invalid query format",
      });
    }

    if (error.message === "API_ERROR") {
      return res.status(500).json({
        success: false,
        message: "AI service error. Please try again later.",
      });
    }

    next(error);
  }
};

/**
 * Clear conversation history
 * @route POST /api/v1/ai/clear
 */
export const clearConversation = async (req, res, next) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Session ID is required",
      });
    }

    conversations.delete(sessionId);

    res.status(200).json({
      success: true,
      message: "Conversation cleared",
    });
  } catch (error) {
    console.error("Error clearing conversation:", error);
    next(error);
  }
};

/**
 * Get system context (for debugging)
 * @route GET /api/v1/ai/context
 */
export const getContext = async (req, res, next) => {
  try {
    const context = await getSystemContext();
    res.status(200).json({
      success: true,
      context,
    });
  } catch (error) {
    console.error("Error getting context:", error);
    next(error);
  }
};
