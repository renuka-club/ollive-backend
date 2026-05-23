"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callGeminiWithLogging = callGeminiWithLogging;
const gemini_1 = require("../services/gemini");
const ingestion_1 = require("../services/ingestion");
async function callGeminiWithLogging(conversationId, messages, assistantMessageId) {
    const requestTimestamp = new Date();
    let content = '';
    let status = 'success';
    let errorMessage = null;
    let usage = { promptTokens: null, completionTokens: null, totalTokens: null };
    const inputMessage = messages.length > 0 ? messages[messages.length - 1].content : '';
    try {
        const result = await (0, gemini_1.callGemini)(messages);
        content = result.text;
        usage = result.usage;
    }
    catch (error) {
        status = 'error';
        errorMessage = error.message || 'Unknown error occurred during Gemini call';
        throw error; // We still want the route to fail if the LLM call fails
    }
    finally {
        const responseTimestamp = new Date();
        const latencyMs = responseTimestamp.getTime() - requestTimestamp.getTime();
        const metadata = {
            conversationId,
            model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-05-20',
            provider: 'google',
            requestTimestamp,
            responseTimestamp,
            latencyMs,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
            inputPreview: inputMessage.substring(0, 200),
            outputPreview: content.substring(0, 200),
            status,
            errorMessage
        };
        // Fire and forget
        (0, ingestion_1.ingestLog)(metadata, assistantMessageId).catch(err => {
            console.error('Failed to ingest log (async):', err);
        });
        // If it threw an error in try block, we won't return here (it throws up),
        // but finally block ensures we logged the error!
        if (status === 'success') {
            // eslint-disable-next-line no-unsafe-finally
            return { content, metadata };
        }
    }
    // This is technically unreachable due to throw in catch, but TS might complain
    throw new Error(errorMessage || 'Unknown error');
}
