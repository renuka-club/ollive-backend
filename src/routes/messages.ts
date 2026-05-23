import { Router } from 'express';
import { supabase } from '../db/supabase';
import { callGeminiWithLogging } from '../sdk/llmWrapper';
import { ingestLog } from '../services/ingestion';
import { ImagePart, callGeminiStream } from '../services/gemini';
import { InferenceMetadata } from '../services/ingestion';
import { v4 as uuidv4 } from 'uuid';

// mergeParams: true is needed because the conversation id is in the parent router path
const router = Router({ mergeParams: true });

// GET /api/conversations/:id/messages
router.get('/', async (req, res, next) => {
  try {
    const { id: conversationId } = req.params as { id: string };

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

// POST /api/conversations/:id/messages
router.post('/', async (req, res, next) => {
  try {
    const { id: conversationId } = req.params as { id: string };
    const { role, content, images } = req.body;
    const attachedImages: ImagePart[] = Array.isArray(images) ? images : [];

    // Validate: must have content or at least one image
    const hasText = content && typeof content === 'string' && content.trim() !== '';
    const hasImages = attachedImages.length > 0;
    if (!hasText && !hasImages) {
      return res.status(400).json({ error: { message: 'Content or at least one image is required', code: 'BAD_REQUEST' } });
    }
    const textContent = hasText ? content.trim() : '🖼️ [image message]';

    if (hasText && content.length > 8000) {
      return res.status(400).json({ error: { message: 'Content too long (max 8000 chars)', code: 'BAD_REQUEST' } });
    }

    // 2. Fetch conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      return res.status(404).json({ error: { message: 'Conversation not found', code: 'NOT_FOUND' } });
    }

    // 3. Fetch last 10 messages for context
    const { data: recentMessages, error: msgError } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (msgError) throw msgError;

    // Supabase returns newest first when ordering by created_at desc, we need oldest first
    const history = (recentMessages || []).reverse();

    // 4. Insert user message into messages table
    const userMessageId = uuidv4();
    // Store a note in content if images are attached
    const storedContent = attachedImages.length > 0
      ? `${textContent}\n[${attachedImages.length} image(s) attached]`
      : textContent;
    const { error: userMsgInsertError } = await supabase
      .from('messages')
      .insert({
        id: userMessageId,
        conversation_id: conversationId,
        role: 'user',
        content: storedContent
      });

    if (userMsgInsertError) throw userMsgInsertError;

    // 5. If conversation.title is null -> set title
    if (!conversation.title) {
      const newTitle = textContent.substring(0, 80);
      await supabase
        .from('conversations')
        .update({ title: newTitle })
        .eq('id', conversationId);
    }

    // 6. Call Gemini (with optional images)
    const fullHistory = [...history, { role: 'user', content: textContent }];
    const assistantMessageId = uuidv4();

    let geminiResponse;
    try {
      geminiResponse = await callGeminiWithLogging(conversationId, fullHistory, attachedImages.length > 0 ? attachedImages : undefined);
    } catch (llmError: any) {
      // Return 502 Bad Gateway if the upstream LLM call fails
      return res.status(502).json({ error: { message: llmError.message || 'Upstream LLM Error', code: 'BAD_GATEWAY' } });
    }

    // 7. Insert assistant response
    const { data: assistantMsgData, error: asstMsgInsertError } = await supabase
      .from('messages')
      .insert({
        id: assistantMessageId,
        conversation_id: conversationId,
        role: 'assistant',
        content: geminiResponse.content
      })
      .select()
      .single();

    if (asstMsgInsertError) throw asstMsgInsertError;

    // 7.5. Ingest the successful inference log (fire and forget)
    ingestLog(geminiResponse.metadata, assistantMessageId).catch(err => {
      console.error('Failed to ingest log after message insert:', err);
    });

    // 8. Increment message_count += 2
    // We can do this safely if we assume no concurrent writes to the same conversation.
    // For a robust atomic increment, we'd use an RPC, but doing it via JS is fine for this demo.
    const newMessageCount = (conversation.message_count || 0) + 2;
    await supabase
      .from('conversations')
      .update({ message_count: newMessageCount }) // updated_at is handled by DB trigger
      .eq('id', conversationId);

    // 10. Return response
    res.json({
      data: {
        message: assistantMsgData,
        metadata: geminiResponse.metadata
      }
    });

  } catch (error) {
    next(error);
  }
});

// POST /api/conversations/:id/messages/stream  — Server-Sent Events streaming
router.post('/stream', async (req, res) => {
  const { id: conversationId } = req.params as { id: string };
  const { content, images } = req.body;
  const attachedImages: ImagePart[] = Array.isArray(images) ? images : [];

  const hasText = content && typeof content === 'string' && content.trim() !== '';
  const hasImages = attachedImages.length > 0;
  if (!hasText && !hasImages) {
    res.status(400).json({ error: 'Content or image required' });
    return;
  }
  const textContent = hasText ? content.trim() : '🖼️ [image message]';

  // SSE headers — must be set BEFORE any write
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if behind proxy
  res.flushHeaders();

  const send = (obj: object) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    // Fetch conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations').select('*').eq('id', conversationId).single();
    if (convError || !conversation) {
      send({ type: 'error', message: 'Conversation not found' });
      res.end(); return;
    }

    // Fetch history
    const { data: recentMessages } = await supabase
      .from('messages').select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false }).limit(10);
    const history = (recentMessages || []).reverse();

    // Upload images to Supabase Storage and collect URLs
    const userMessageId = uuidv4();
    const imageUrls: { url: string; mimeType: string }[] = [];
    for (let i = 0; i < attachedImages.length; i++) {
      const img = attachedImages[i];
      const ext = img.mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
      const path = `${conversationId}/${userMessageId}/${i}.${ext}`;
      const buffer = Buffer.from(img.data, 'base64');
      const { error: uploadErr } = await supabase.storage
        .from('chat-images')
        .upload(path, buffer, { contentType: img.mimeType, upsert: false });
      if (uploadErr) {
        console.warn('Image upload failed:', uploadErr.message);
        continue; // Don't block the message if upload fails
      }
      const { data: urlData } = supabase.storage.from('chat-images').getPublicUrl(path);
      imageUrls.push({ url: urlData.publicUrl, mimeType: img.mimeType });
    }

    // Insert user message with image URLs in metadata
    const msgMetadata = imageUrls.length > 0 ? { images: imageUrls } : null;
    const storedContent = textContent; // clean text — images stored in metadata
    const { error: userErr } = await supabase.from('messages').insert({
      id: userMessageId,
      conversation_id: conversationId,
      role: 'user',
      content: storedContent,
      metadata: msgMetadata,
    });
    if (userErr) { send({ type: 'error', message: userErr.message }); res.end(); return; }

    // Send image URLs to frontend immediately so optimistic message can update
    if (imageUrls.length > 0) {
      send({ type: 'images', urls: imageUrls });
    }

    // Set title if blank
    if (!conversation.title) {
      await supabase.from('conversations')
        .update({ title: textContent.substring(0, 80) }).eq('id', conversationId);
    }

    // Stream Gemini
    const requestTimestamp = new Date();
    const fullHistory = [...history, { role: 'user', content: textContent }];
    const { stream, getUsage } = await callGeminiStream(
      fullHistory,
      attachedImages.length > 0 ? attachedImages : undefined
    );

    let fullContent = '';
    for await (const chunk of stream) {
      fullContent += chunk;
      send({ type: 'chunk', content: chunk });
    }

    const responseTimestamp = new Date();

    // Insert assistant message
    const assistantMessageId = uuidv4();
    const { data: assistantMsg, error: asstErr } = await supabase.from('messages').insert({
      id: assistantMessageId, conversation_id: conversationId, role: 'assistant', content: fullContent
    }).select().single();
    if (asstErr) { send({ type: 'error', message: asstErr.message }); res.end(); return; }

    // Increment message count
    await supabase.from('conversations')
      .update({ message_count: (conversation.message_count || 0) + 2 })
      .eq('id', conversationId);

    // Async log
    const usage = getUsage();
    const metadata: InferenceMetadata = {
      conversationId,
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      provider: 'google',
      requestTimestamp,
      responseTimestamp,
      latencyMs: responseTimestamp.getTime() - requestTimestamp.getTime(),
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      inputPreview: textContent.substring(0, 200),
      outputPreview: fullContent.substring(0, 200),
      status: 'success',
      errorMessage: null,
    };
    ingestLog(metadata, assistantMessageId).catch(err => console.error('ingest error:', err));

    send({ type: 'done', messageId: assistantMessageId });
  } catch (err: any) {
    send({ type: 'error', message: err?.message || 'Stream error' });
  } finally {
    res.end();
  }
});

export default router;
