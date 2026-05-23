import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/env';

const genai = new GoogleGenerativeAI(config.GEMINI_API_KEY);

export interface ImagePart {
  mimeType: string;
  data: string; // base64
}

export async function callGemini(
  messages: { role: string; content: string }[],
  images?: ImagePart[]
) {
  // Always re-create the model so we can pick the right one from env at call time
  const currentModel = genai.getGenerativeModel({ model: config.GEMINI_MODEL });

  // Enforce context window: Send last 10 messages maximum to Gemini
  const contextMessages = messages.slice(-10);

  // Separate history and the new turn
  const historyMessages = contextMessages.slice(0, -1);
  const newMessage = contextMessages[contextMessages.length - 1];

  // Map roles: 'assistant' maps to 'model' for Gemini
  const formattedHistory = historyMessages.map(msg => {
    let role = msg.role;
    if (role === 'assistant') role = 'model';
    if (role === 'system') role = 'user';

    return {
      role: role,
      parts: [{ text: msg.content }]
    };
  });

  const chat = currentModel.startChat({ history: formattedHistory });

  // Build multimodal parts for the current message
  const messageParts: any[] = [];
  if (images && images.length > 0) {
    for (const img of images) {
      messageParts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }
  }
  // Text always goes last (best practice for vision models)
  if (newMessage.content.trim()) {
    messageParts.push({ text: newMessage.content });
  } else if (messageParts.length === 0) {
    messageParts.push({ text: '(no content)' });
  }

  const result = await chat.sendMessage(messageParts);
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

// ── Streaming version ────────────────────────────────────────────────────────
export async function callGeminiStream(
  messages: { role: string; content: string }[],
  images?: ImagePart[]
): Promise<{
  stream: AsyncGenerator<string>;
  getUsage: () => { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null };
}> {
  const currentModel = genai.getGenerativeModel({ model: config.GEMINI_MODEL });
  const contextMessages = messages.slice(-10);
  const historyMessages = contextMessages.slice(0, -1);
  const newMessage = contextMessages[contextMessages.length - 1];

  const formattedHistory = historyMessages.map(msg => {
    let role = msg.role;
    if (role === 'assistant') role = 'model';
    if (role === 'system') role = 'user';
    return { role, parts: [{ text: msg.content }] };
  });

  const chat = currentModel.startChat({ history: formattedHistory });

  const messageParts: any[] = [];
  if (images && images.length > 0) {
    for (const img of images) {
      messageParts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }
  }
  if (newMessage.content.trim()) {
    messageParts.push({ text: newMessage.content });
  } else if (messageParts.length === 0) {
    messageParts.push({ text: '(no content)' });
  }

  const streamResult = await chat.sendMessageStream(messageParts);

  let usageData = { promptTokens: null as number | null, completionTokens: null as number | null, totalTokens: null as number | null };

  async function* tokenStream(): AsyncGenerator<string> {
    for await (const chunk of streamResult.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
    // After stream ends, grab usage from the response
    const response = await streamResult.response;
    const usage = response.usageMetadata;
    usageData = {
      promptTokens: usage?.promptTokenCount || null,
      completionTokens: usage?.candidatesTokenCount || null,
      totalTokens: usage?.totalTokenCount || null,
    };
  }

  return {
    stream: tokenStream(),
    getUsage: () => usageData,
  };
}
