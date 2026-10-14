import {
  AiProvider,
  AiRequestContext,
  AiChatResponse,
  ChatMessage,
  ToolCall,
} from './types';
import { GeminiProvider } from './providers/geminiProvider';
import { ToolRegistry } from './toolRegistry';

const SYSTEM_INSTRUCTION = `You are "RailFlow AI", the intelligent railway journey assistant for RailFlow (IRCTC Modernized).

Your role is to assist passengers in planning train travel, finding schedules, checking verified berth availability, explaining fare breakdowns, verifying PNR statuses, and tracking trains.

CRITICAL OPERATIONAL RULES:
1. TRUTHFULNESS & GROUNDING: You MUST NEVER invent, assume, or hallucinate train numbers, train names, departure/arrival times, available seat counts, or ticket fares. Always call the "search_trains" tool to fetch real railway data from RailFlow.
2. FARES & BREAKDOWNS: Never calculate ticket prices mentally or make up rates. Use "get_fare" to display authoritative server-side fare quotes with GST breakdowns.
3. BOOKINGS & PNRs: Only retrieve booking details via "get_booking_status" or "get_my_bookings". These tools strictly enforce passenger ownership and require authentication. If a user is not signed in or asks about someone else's booking, clearly explain that RailFlow protects passenger privacy and requires sign-in.
4. RUNNING STATUS & TELEMETRY: When asked about a train's location or delay, call "get_train_running_status". Clearly state if the telemetry is from live tracking or scheduled timetable fallback. Never invent GPS coordinates.
5. NO STATE-CHANGING ACTIONS: You cannot complete reservations, charge payments, cancel tickets, or issue refunds directly via conversation. Always invite the user to use RailFlow's interactive booking flow.
6. TONE & STYLE: Be concise, courteous, professional, and clear. Format times in 24h format and prices in Indian Rupees (₹).`;

export class AiService {
  private provider: AiProvider;

  constructor(provider?: AiProvider) {
    this.provider = provider || new GeminiProvider();
  }

  public setProvider(provider: AiProvider) {
    this.provider = provider;
  }

  public isAvailable(): boolean {
    if (this.provider instanceof GeminiProvider) {
      return this.provider.isConfigured();
    }
    return true;
  }

  public async chat(
    userMessage: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    context: AiRequestContext = {}
  ): Promise<AiChatResponse> {
    // 1. Sanitize & truncate inputs
    const trimmedMessage = userMessage.trim().slice(0, 1000);
    if (!trimmedMessage) {
      return {
        reply: "Please enter a question or destination so I can assist your journey.",
        authenticated: Boolean(context.userId),
      };
    }

    // Check availability
    if (!this.isAvailable()) {
      return {
        reply:
          "RailFlow AI is currently standing by. The assistant requires a free Gemini API key to be configured in the server environment (GEMINI_API_KEY). You can continue searching trains, checking fares, and booking tickets using our standard forms.",
        authenticated: Boolean(context.userId),
      };
    }

    // 2. Build conversation history (bounded to last 10 messages)
    const boundedHistory = history.slice(-10);
    const messages: ChatMessage[] = [];

    for (const h of boundedHistory) {
      if (h.role === 'user' || h.role === 'assistant') {
        messages.push({
          role: h.role === 'assistant' ? 'model' : 'user',
          content: h.content.slice(0, 1000),
        });
      }
    }

    // Append current user message
    messages.push({
      role: 'user',
      content: trimmedMessage,
    });

    const tools = ToolRegistry.getDefinitions();
    let accumulatedTrainResults: any[] = [];
    const toolExecutions: Array<{ tool: string; success: boolean }> = [];

    // 3. Execution loop (max 3 rounds to avoid infinite tool loops)
    let maxRounds = 3;
    let finalReply = '';

    while (maxRounds > 0) {
      maxRounds--;

      let response;
      try {
        response = await this.provider.generateResponse(
          messages,
          tools,
          SYSTEM_INSTRUCTION,
          { timeoutMs: 15000 }
        );
      } catch (err: any) {
        if (err.code === 'AI_QUOTA_EXHAUSTED') {
          return {
            reply:
              "RailFlow AI has temporarily reached its Google Gemini free-tier rate limit or quota. Please wait a few moments and try again, or use the interactive search form on the homepage.",
            authenticated: Boolean(context.userId),
          };
        }
        if (err.code === 'AI_TIMEOUT') {
          return {
            reply:
              "The AI journey query timed out while communicating with the provider. Please try asking again.",
            authenticated: Boolean(context.userId),
          };
        }
        throw err;
      }

      // If text response provided
      if (response.text) {
        finalReply = response.text;
      }

      // If no tool calls requested, we are done
      if (!response.toolCalls || response.toolCalls.length === 0) {
        break;
      }

      // Record model's tool calls in history
      messages.push({
        role: 'model',
        content: response.text || '',
        toolCalls: response.toolCalls,
        rawParts: response.rawParts,
      });

      // Execute each tool call
      for (const call of response.toolCalls) {
        const execution = await ToolRegistry.executeTool(call.name, call.args, context);
        toolExecutions.push({ tool: call.name, success: execution.success });

        if (call.name === 'search_trains' && execution.success && execution.data?.trains) {
          accumulatedTrainResults = execution.data.trains;
        }

        // Add tool response to messages
        messages.push({
          role: 'tool',
          name: call.name,
          toolCallId: call.id,
          content: execution.success ? JSON.stringify(execution.data) : JSON.stringify({ error: execution.error }),
        });
      }
    }

    return {
      reply: finalReply || "Here is the information from RailFlow's live schedule records.",
      trainResults: accumulatedTrainResults.length > 0 ? accumulatedTrainResults : undefined,
      toolExecutions,
      authenticated: Boolean(context.userId),
    };
  }
}

export const aiService = new AiService();
