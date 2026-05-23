import { supabase } from '../db/supabase';

export interface InferenceMetadata {
  conversationId: string;
  model: string;
  provider: 'google';
  requestTimestamp: Date;
  responseTimestamp: Date;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  inputPreview: string;
  outputPreview: string;
  status: 'success' | 'error';
  errorMessage: string | null;
}

export async function ingestLog(
  metadata: InferenceMetadata,
  messageId: string | null
): Promise<void> {
  try {
    // Validation
    if (!Number.isInteger(metadata.latencyMs) || metadata.latencyMs < 0) {
      console.error('Validation Error: latencyMs must be a positive integer', metadata.latencyMs);
      return;
    }
    if (metadata.status !== 'success' && metadata.status !== 'error') {
      console.error('Validation Error: status must be success or error', metadata.status);
      return;
    }
    if (!metadata.model || typeof metadata.model !== 'string' || metadata.model.trim() === '') {
      console.error('Validation Error: model must be non-empty string', metadata.model);
      return;
    }
    
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(metadata.conversationId)) {
      console.error('Validation Error: conversationId must be a valid UUID', metadata.conversationId);
      return;
    }

    // Insert into inference_logs
    const { error: logError } = await supabase
      .from('inference_logs')
      .insert({
        conversation_id: metadata.conversationId,
        message_id: messageId,
        provider: metadata.provider,
        model: metadata.model,
        status: metadata.status,
        latency_ms: metadata.latencyMs,
        prompt_tokens: metadata.promptTokens,
        completion_tokens: metadata.completionTokens,
        total_tokens: metadata.totalTokens,
        input_preview: metadata.inputPreview.substring(0, 200),
        output_preview: metadata.outputPreview.substring(0, 200),
        error_message: metadata.errorMessage,
        request_timestamp: metadata.requestTimestamp.toISOString(),
        response_timestamp: metadata.responseTimestamp.toISOString()
      });

    if (logError) {
      console.error('Supabase Error: failed to insert inference log', logError);
      return;
    }

    // Update message token_count if available and messageId is provided
    if (messageId && metadata.totalTokens !== null) {
      const { error: msgError } = await supabase
        .from('messages')
        .update({ token_count: metadata.totalTokens })
        .eq('id', messageId);
      
      if (msgError) {
        console.error('Supabase Error: failed to update message token count', msgError);
      }
    }

  } catch (err) {
    console.error('Ingestion Error: unexpected error during log ingestion', err);
  }
}
