import { callGemini, ImagePart } from '../services/gemini';
import { ingestLog, InferenceMetadata } from '../services/ingestion';

export async function callGeminiWithLogging(
  conversationId: string,
  messages: { role: string; content: string }[],
  images?: ImagePart[]
): Promise<{ content: string; metadata: InferenceMetadata }> {
  const requestTimestamp = new Date();
  const inputMessage = messages.length > 0 ? messages[messages.length - 1].content : '';

  try {
    const result = await callGemini(messages, images);
    const responseTimestamp = new Date();
    
    const metadata: InferenceMetadata = {
      conversationId,
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      provider: 'google',
      requestTimestamp,
      responseTimestamp,
      latencyMs: responseTimestamp.getTime() - requestTimestamp.getTime(),
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
      inputPreview: inputMessage.substring(0, 200),
      outputPreview: result.text.substring(0, 200),
      status: 'success',
      errorMessage: null
    };

    return { content: result.text, metadata };
  } catch (error: any) {
    const responseTimestamp = new Date();
    const metadata: InferenceMetadata = {
      conversationId,
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      provider: 'google',
      requestTimestamp,
      responseTimestamp,
      latencyMs: responseTimestamp.getTime() - requestTimestamp.getTime(),
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      inputPreview: inputMessage.substring(0, 200),
      outputPreview: '',
      status: 'error',
      errorMessage: error.message || 'Unknown error occurred during Gemini call'
    };

    // Fire and forget error log (no message ID since generation failed)
    ingestLog(metadata, null).catch(err => {
      console.error('Failed to ingest error log:', err);
    });

    throw error;
  }
}
