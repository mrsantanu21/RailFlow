import { apiClient } from './client';
import type { AiStatus, AiTrainSummary } from '../types/ai';

export async function getAiStatus(): Promise<AiStatus> {
  const res = await apiClient.get('/ai/status');
  return res.data?.data;
}

export async function sendAiChat(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<{
  reply: string;
  trainResults?: AiTrainSummary[];
  authenticated: boolean;
  toolExecutions?: Array<{ tool: string; success: boolean }>;
}> {
  const res = await apiClient.post('/ai/chat', { message, history });
  return res.data?.data;
}
