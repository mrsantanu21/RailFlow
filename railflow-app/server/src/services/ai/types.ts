export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'model' | 'tool';
  content: string;
  name?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  rawParts?: any[];
}

export interface ToolParameterProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description: string;
  enum?: string[];
  items?: { type: string };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterProperty>;
    required: string[];
  };
  requireAuth?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
}

export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  data?: any;
  error?: string;
}

export interface AiProviderResponse {
  text: string;
  toolCalls?: ToolCall[];
  finishReason?: string;
  rawParts?: any[];
  usage?: {
    promptTokens?: number;
    candidatesTokens?: number;
  };
}

export interface AiProvider {
  name: string;
  generateResponse(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    systemInstruction?: string,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<AiProviderResponse>;
}

export interface AiRequestContext {
  userId?: string;
  userRole?: string;
  userName?: string;
}

export interface AiChatRequest {
  message: string;
  history?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

export interface AiChatResponse {
  reply: string;
  trainResults?: any[];
  toolExecutions?: Array<{
    tool: string;
    success: boolean;
  }>;
  authenticated: boolean;
}
