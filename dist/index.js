"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const env_1 = require("./config/env");
const conversations_1 = __importDefault(require("./routes/conversations"));
const messages_1 = __importDefault(require("./routes/messages"));
const logs_1 = __importDefault(require("./routes/logs"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const errorHandler_1 = require("./middleware/errorHandler");
const requestLogger_1 = require("./middleware/requestLogger");
const app = (0, express_1.default)();
// Middleware
app.use((0, cors_1.default)({
    origin: [env_1.config.FRONTEND_URL, 'http://localhost:5173']
}));
app.use(express_1.default.json({ limit: '8000kb' })); // Increase limit if necessary, but PRD says max content length 8000 chars
app.use(requestLogger_1.requestLogger);
// API Routes
app.use('/api/conversations', conversations_1.default);
// Mount messages router on top of the conversation id route
app.use('/api/conversations/:id/messages', messages_1.default);
app.use('/api/logs', logs_1.default);
app.use('/api/analytics', analytics_1.default);
// Global Error Handler
app.use(errorHandler_1.errorHandler);
app.listen(env_1.config.PORT, () => {
    console.log(`🚀 Ollive Backend is running on http://localhost:${env_1.config.PORT}`);
});
