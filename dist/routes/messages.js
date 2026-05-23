"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../db/supabase");
const llmWrapper_1 = require("../sdk/llmWrapper");
const uuid_1 = require("uuid");
// mergeParams: true is needed because the conversation id is in the parent router path
const router = (0, express_1.Router)({ mergeParams: true });
// GET /api/conversations/:id/messages
router.get('/', async (req, res, next) => {
    try {
        const { id: conversationId } = req.params;
        const { data, error } = await supabase_1.supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });
        if (error)
            throw error;
        res.json({ data });
    }
    catch (error) {
        next(error);
    }
});
// POST /api/conversations/:id/messages
router.post('/', async (req, res, next) => {
    try {
        const { id: conversationId } = req.params;
        const { role, content } = req.body;
        if (!content || typeof content !== 'string' || content.trim() === '') {
            return res.status(400).json({ error: { message: 'Content must be a non-empty string', code: 'BAD_REQUEST' } });
        }
        if (content.length > 8000) {
            return res.status(400).json({ error: { message: 'Content too long (max 8000 chars)', code: 'BAD_REQUEST' } });
        }
        // 2. Fetch conversation
        const { data: conversation, error: convError } = await supabase_1.supabase
            .from('conversations')
            .select('*')
            .eq('id', conversationId)
            .single();
        if (convError || !conversation) {
            return res.status(404).json({ error: { message: 'Conversation not found', code: 'NOT_FOUND' } });
        }
        // 3. Fetch last 10 messages for context
        const { data: recentMessages, error: msgError } = await supabase_1.supabase
            .from('messages')
            .select('role, content')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .limit(10);
        if (msgError)
            throw msgError;
        // Supabase returns newest first when ordering by created_at desc, we need oldest first
        const history = (recentMessages || []).reverse();
        // 4. Insert user message into messages table
        const userMessageId = (0, uuid_1.v4)();
        const { error: userMsgInsertError } = await supabase_1.supabase
            .from('messages')
            .insert({
            id: userMessageId,
            conversation_id: conversationId,
            role: 'user',
            content: content.trim()
        });
        if (userMsgInsertError)
            throw userMsgInsertError;
        // 5. If conversation.title is null -> set title
        if (!conversation.title) {
            const newTitle = content.trim().substring(0, 80);
            await supabase_1.supabase
                .from('conversations')
                .update({ title: newTitle })
                .eq('id', conversationId);
        }
        // 6. Call Gemini
        const fullHistory = [...history, { role: 'user', content: content.trim() }];
        const assistantMessageId = (0, uuid_1.v4)(); // Pre-generate so the wrapper can send it to ingestion
        let geminiResponse;
        try {
            geminiResponse = await (0, llmWrapper_1.callGeminiWithLogging)(conversationId, fullHistory, assistantMessageId);
        }
        catch (llmError) {
            // Return 502 Bad Gateway if the upstream LLM call fails
            return res.status(502).json({ error: { message: llmError.message || 'Upstream LLM Error', code: 'BAD_GATEWAY' } });
        }
        // 7. Insert assistant response
        const { data: assistantMsgData, error: asstMsgInsertError } = await supabase_1.supabase
            .from('messages')
            .insert({
            id: assistantMessageId,
            conversation_id: conversationId,
            role: 'assistant',
            content: geminiResponse.content
        })
            .select()
            .single();
        if (asstMsgInsertError)
            throw asstMsgInsertError;
        // 8. Increment message_count += 2
        // We can do this safely if we assume no concurrent writes to the same conversation.
        // For a robust atomic increment, we'd use an RPC, but doing it via JS is fine for this demo.
        const newMessageCount = (conversation.message_count || 0) + 2;
        await supabase_1.supabase
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
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
