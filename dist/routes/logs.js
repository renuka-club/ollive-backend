"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../db/supabase");
const router = (0, express_1.Router)();
// GET /api/logs
router.get('/', async (req, res, next) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const conversationId = req.query.conversation_id;
        let query = supabase_1.supabase
            .from('inference_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);
        if (conversationId) {
            query = query.eq('conversation_id', conversationId);
        }
        const { data, error } = await query;
        if (error)
            throw error;
        res.json({ data });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
