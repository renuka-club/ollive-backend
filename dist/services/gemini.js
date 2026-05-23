"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callGemini = callGemini;
const generative_ai_1 = require("@google/generative-ai");
const env_1 = require("../config/env");
const genai = new generative_ai_1.GoogleGenerativeAI(env_1.config.GEMINI_API_KEY);
const model = genai.getGenerativeModel({ model: env_1.config.GEMINI_MODEL });
async function callGemini(messages) {
    // Enforce context window: Send last 10 messages maximum to Gemini
    const contextMessages = messages.slice(-10);
    // Separate history and the new turn
    const historyMessages = contextMessages.slice(0, -1);
    const newMessage = contextMessages[contextMessages.length - 1];
    // Map roles: 'assistant' maps to 'model' for Gemini
    const formattedHistory = historyMessages.map(msg => {
        let role = msg.role;
        if (role === 'assistant')
            role = 'model';
        if (role === 'system')
            role = 'user'; // Treat system as user if encountered
        return {
            role: role,
            parts: [{ text: msg.content }]
        };
    });
    const chat = model.startChat({
        history: formattedHistory,
    });
    const result = await chat.sendMessage(newMessage.content);
    const responseText = result.response.text();
    const usage = result.response.usageMetadata;
    return {
        text: responseText,
        usage: {
            promptTokens: usage?.promptTokenCount || null,
            completionTokens: usage?.candidatesTokenCount || null,
            totalTokens: usage?.totalTokenCount || null
        }
    };
}
