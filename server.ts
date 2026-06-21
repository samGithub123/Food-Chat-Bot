import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

// Set up JSON body parser with a large limit to support base64 food images
app.use(express.json({ limit: "20mb" }));

// Lazy initializer for GoogleGenAI client (avoids crashing on startup if API key is not yet set)
let aiInstance: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("Neither GEMINI_API_KEY nor GOOGLE_API_KEY is defined. Please add one to your environment configurations.");
    }
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiInstance;
}

const policy_document = `
FoodFix Customer Support Policy

1. Refund Policy
Customers may be eligible for a refund if:
- The order is cancelled by the restaurant.
- The order is not delivered.
- The delivered food is spoiled, unsafe, or not edible.
- A major item is missing from the order.
- The wrong item is delivered.

Refunds are not guaranteed automatically. Final refund approval may require review by the FoodFix support team.

2. Refund Timeline
Once approved, refunds usually take 3 to 7 business days to reflect in the customer's original payment method.
Wallet refunds may reflect faster.

3. Delay Compensation Policy
If an order is delayed, the customer may be eligible for an apology coupon depending on the delay duration and order value.
A delayed order does not always mean automatic refund.
If the customer wants exact live order status, the issue should be escalated to a human agent.

4. Cancellation Policy
Customers can cancel an order before the restaurant starts preparing it.
Once preparation has started, cancellation may not be allowed.
If the order is extremely delayed, FoodFix support may review the case.

5. Coupon Policy
Only one coupon can be applied per order unless clearly mentioned in the offer.
Coupons may fail if the order does not meet minimum order value, restaurant eligibility, location eligibility, or payment method conditions.

6. Missing or Wrong Item Policy
If an item is missing or the wrong item is delivered, the customer should report it through support.
FoodFix may ask for order details or an image.
Refund or replacement depends on verification.

7. Food Quality Policy
If food is spoiled, unsafe, spilled, leaked, or packaging is damaged, the customer should upload a clear image.
FoodFix support will review the complaint.
The customer may be eligible for refund, coupon, or replacement depending on the case.

8. Human Escalation Policy
Escalate to a human agent if:
- The customer asks for a human.
- The issue needs payment verification.
- The issue needs live order tracking.
- The issue is unclear.
- The customer is very angry.
- The AI is not sure about the answer.
`;

const MODEL_NAME = "gemini-2.5-flash";

// ai_func1 handles general queries & policy queries
async function ai_func1(query: string, historyText: string): Promise<string> {
  const ai = getGeminiClient();
  const prompt = `You're a helpful assistant of a food service company called food fix,
 please respond to user's query, be courteous.
 Use the following policy document -
 ${policy_document}.
 If the question is related to policy then only answer it else say that I'm routing to human support agent
 Here is the query - ${query}.
Use the following historical conversation -
${historyText}`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
  });

  return response.text || "I'm routing to human support agent";
}

// ai_func2 handles image-based food quality analysis
async function ai_func2(query: string, imageBase64: string, mimeType: string, historyText: string): Promise<string> {
  const ai = getGeminiClient();
  const prompt = `You're a helpful assistant of a food service company called food fix,
 please respond to user's query, be courteous.
 Use the following policy document -
 ${policy_document}.
 Check the food quality and if the food quality is bad- food is burnt or there is mould then tell him that refund is being processed and also apologize. If you verify the food packaging, container, or food has other actual corrupt status (ruined, spoiled, completely spilled, damaged delivery), provide refund and apologize.
 Otherwise, if the food is not corrupt (it looks completely normal, not burnt, no mould, no damage) or if you cannot verify any actual damage or bad quality, you must refuse the refund and state that you are escalating/routing this query to a human support agent.
 Here is the query - ${query}.
Use the following historical conversation -
${historyText}`;

  const imagePart = {
    inlineData: {
      data: imageBase64,
      mimeType: mimeType || "image/png",
    },
  };

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: [prompt, imagePart],
  });

  return response.text || "I am escalating this issue to a human support agent.";
}

// Simple internal helper to determine if query is related to food quality issues before requesting image
async function classifyQuery(query: string): Promise<"food_quality" | "other"> {
  try {
    const ai = getGeminiClient();
    const classificationPrompt = `
You are an AI classifier for food delivery customer support.
Classify the following customer query into one of two categories:
- "food_quality": If the customer is complaining about the physical state, quality, or visual issues of the food they received (e.g. food is bad, burnt, spoiled, cold, stale, ruined, has mould, has hair, is spilled, has insects, packaging is completely ruined, wrong look/prepared quality).
- "other": Everything else (general policy questions like cancellation, general refund questions not specific to physical food quality, missing items, coupons, delivery times, greetings, general queries).

Return ONLY the option name ("food_quality" or "other") without any formatting, quotes, or explanation.

Customer Query: "${query}"
`;
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: classificationPrompt,
    });
    const label = response.text?.trim().toLowerCase();
    if (label && label.includes("food_quality")) {
      return "food_quality";
    }
  } catch (error) {
    console.error("Classification failed, default to other:", error);
  }
  return "other";
}

// API Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Main chat support endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { query, image, mimeType, history } = req.body;

    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    // Format historical messages as requested
    let historyText = "";
    if (Array.isArray(history) && history.length > 0) {
      historyText = history
        .map((msg: any) => `${msg.isBot ? "Assistant" : "Customer"}: ${msg.text}`)
        .join("\n");
    }

    // Ensure client can be initialized
    try {
      getGeminiClient();
    } catch (err: any) {
      return res.json({
        text: "System Configuration Error: Please configure GEMINI_API_KEY or GOOGLE_API_KEY in your environment secrets or .env file.",
        error: true,
      });
    }

    // Case 1: Active Image is uploaded by user
    if (image) {
      const reply = await ai_func2(query, image, mimeType, historyText);
      return res.json({ text: reply });
    }

    // Case 2: No image provided yet. Check if this is a food quality issue
    const classification = await classifyQuery(query);
    if (classification === "food_quality") {
      return res.json({
        text: "I am sorry to hear about the quality of your food. Under our Food Quality Policy, please select and upload a clear photo of the food using the camera/upload icon in the chat bar so I can inspect it and assist you with a refund or escalation.",
        requestImage: true,
      });
    }

    // Case 3: Policy or other text Q&A
    const reply = await ai_func1(query, historyText);
    return res.json({ text: reply });

  } catch (err: any) {
    console.error("Error in chat endpoint:", err);
    return res.status(500).json({
      text: "Sorry, I encountered an internal error. Routing to human support agent.",
      error: true,
    });
  }
});

// Vite server startup configuration
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express application running on port ${PORT}`);
  });
}

start();
