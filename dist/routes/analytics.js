"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../db/supabase");
const router = (0, express_1.Router)();
// GET /api/analytics/summary
router.get('/summary', async (req, res, next) => {
    try {
        // For simplicity in this demo, we'll fetch the last 1000 logs and aggregate in memory.
        // In a production system, an RPC function should be used to offload this to PostgreSQL.
        const { data: logs, error } = await supabase_1.supabase
            .from('inference_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1000);
        if (error)
            throw error;
        if (!logs || logs.length === 0) {
            return res.json({
                data: {
                    total_inferences: 0,
                    avg_latency_ms: 0,
                    total_tokens: 0,
                    error_rate_pct: 0,
                    success_count: 0,
                    error_count: 0,
                    by_conversation: [],
                    latency_series: []
                }
            });
        }
        let total_latency = 0;
        let total_tokens = 0;
        let success_count = 0;
        let error_count = 0;
        const convMap = {};
        for (const log of logs) {
            total_latency += log.latency_ms || 0;
            total_tokens += log.total_tokens || 0;
            if (log.status === 'success') {
                success_count++;
            }
            else {
                error_count++;
            }
            if (log.conversation_id) {
                if (!convMap[log.conversation_id]) {
                    convMap[log.conversation_id] = { total_tokens: 0, inference_count: 0 };
                }
                convMap[log.conversation_id].total_tokens += log.total_tokens || 0;
                convMap[log.conversation_id].inference_count += 1;
            }
        }
        const total_inferences = logs.length;
        const avg_latency_ms = Math.round(total_latency / total_inferences);
        const error_rate_pct = Number(((error_count / total_inferences) * 100).toFixed(1));
        const by_conversation = Object.entries(convMap).map(([id, stats]) => ({
            conversation_id: id,
            ...stats
        })).sort((a, b) => b.total_tokens - a.total_tokens).slice(0, 20); // Top 20
        // Reverse the logs slice to chronological order for the chart
        const latency_series = logs.slice(0, 50).reverse().map((log) => ({
            timestamp: log.created_at,
            latency_ms: log.latency_ms,
            model: log.model
        }));
        res.json({
            data: {
                total_inferences,
                avg_latency_ms,
                total_tokens,
                error_rate_pct,
                success_count,
                error_count,
                by_conversation,
                latency_series
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
