import {
  AiProvider,
  AiProviderResponse,
  ChatMessage,
  ToolDefinition,
} from '../types';

export class GeminiProvider implements AiProvider {
  public name = 'gemini';
  private apiKey: string;
  private model: string;
  private candidateModels: string[];
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey !== undefined ? apiKey : (process.env.GEMINI_API_KEY || '');
    this.model = model || process.env.GEMINI_MODEL || 'gemini-3.7-flash';
    this.candidateModels = Array.from(
      new Set([
        this.model,
        'gemini-3.7-flash',
        'gemini-3.5-flash',
        'gemini-3.6-flash',
        'gemini-3.8-flash',
      ])
    );
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0 && this.apiKey !== 'your_gemini_api_key_here');
  }

  public async generateResponse(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    systemInstruction?: string,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<AiProviderResponse> {
    if (!this.isConfigured()) {
      throw new Error('GEMINI_API_KEY_MISSING: Gemini API key is not configured in server environment.');
    }

    const timeoutMs = options?.timeoutMs || 15000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // If an external signal was passed, forward it
    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      // 1. Format Gemini Contents
      const contents = this.formatContents(messages);

      // 2. Format Gemini Tools
      const formattedTools = tools.length > 0 ? [
        {
          function_declarations: tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: {
              type: 'OBJECT',
              properties: this.convertSchemaProperties(t.parameters.properties),
              required: t.parameters.required,
            },
          })),
        },
      ] : undefined;

      const requestBody: Record<string, any> = {
        contents,
        generationConfig: {
          temperature: 0.2, // Low temperature for factual consistency
          maxOutputTokens: 1024,
        },
      };

      if (systemInstruction) {
        requestBody.systemInstruction = {
          parts: [{ text: systemInstruction }],
        };
      }

      if (formattedTools) {
        requestBody.tools = formattedTools;
        requestBody.toolConfig = {
          functionCallingConfig: {
            mode: 'AUTO',
          },
        };
      }

      let lastError: any = null;

      // Try candidate models in order if 429 occurs
      for (const modelToTry of this.candidateModels) {
        try {
          const url = `${this.baseUrl}/models/${encodeURIComponent(modelToTry)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });

          if (!response.ok) {
            const errorText = await response.text();
            let parsedError: any;
            try {
              parsedError = JSON.parse(errorText);
            } catch {
              parsedError = { error: { message: errorText } };
            }

            const status = response.status;
            const errMsg = parsedError?.error?.message || response.statusText;

            if (status === 429 || errMsg.includes('RESOURCE_EXHAUSTED')) {
              lastError = new Error(
                'AI_QUOTA_EXHAUSTED: Gemini API free-tier quota exceeded. Please try again later or use the regular search interface.'
              );
              (lastError as any).code = 'AI_QUOTA_EXHAUSTED';
              // Try next model candidate
              continue;
            }

            if (status === 400 && errMsg.includes('API key')) {
              const err = new Error('AI_INVALID_KEY: The configured Gemini API key is invalid.');
              (err as any).code = 'AI_INVALID_KEY';
              throw err;
            }

            // If model is not found, try next candidate
            if (status === 404) {
              continue;
            }

            const err = new Error(`AI_PROVIDER_ERROR (${status}): ${errMsg}`);
            (err as any).code = 'AI_PROVIDER_ERROR';
            (err as any).status = status;
            throw err;
          }

          const data = await response.json();
          // Successfully used model, remember it as active model
          this.model = modelToTry;
          return this.parseGeminiResponse(data);
        } catch (err: any) {
          if (err.code === 'AI_QUOTA_EXHAUSTED' || err.status === 404) {
            continue;
          }
          throw err;
        }
      }

      if (lastError) {
        throw lastError;
      }

      throw new Error('AI_PROVIDER_ERROR: Unable to get a response from any Gemini model.');
    } catch (err: any) {
      if (err.name === 'AbortError') {
        const timeoutErr = new Error('AI_TIMEOUT: Gemini API request timed out after 15 seconds.');
        (timeoutErr as any).code = 'AI_TIMEOUT';
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private convertSchemaProperties(props: Record<string, any>) {
    const converted: Record<string, any> = {};
    for (const [key, prop] of Object.entries(props)) {
      converted[key] = {
        type: (prop.type || 'STRING').toUpperCase(),
        description: prop.description,
        ...(prop.enum ? { enum: prop.enum } : {}),
        ...(prop.items ? { items: { type: (prop.items.type || 'STRING').toUpperCase() } } : {}),
      };
    }
    return converted;
  }

  private formatContents(messages: ChatMessage[]) {
    const contents: any[] = [];

    for (const m of messages) {
      if (m.role === 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: m.content }],
        });
      } else if (m.role === 'assistant' || m.role === 'model') {
        if (m.rawParts && m.rawParts.length > 0) {
          contents.push({
            role: 'model',
            parts: m.rawParts,
          });
        } else {
          const parts: any[] = [];
          if (m.toolCalls && m.toolCalls.length > 0) {
            for (const tc of m.toolCalls) {
              parts.push({
                functionCall: {
                  name: tc.name,
                  args: tc.args,
                },
              });
            }
          }
          if (m.content) {
            parts.push({ text: m.content });
          }
          contents.push({
            role: 'model',
            parts: parts.length > 0 ? parts : [{ text: '' }],
          });
        }
      } else if (m.role === 'tool') {
        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: m.name,
                response: typeof m.content === 'string' ? { result: m.content } : m.content,
              },
            },
          ],
        });
      }
    }

    return contents;
  }

  private parseGeminiResponse(data: any): AiProviderResponse {
    const candidate = data.candidates?.[0];
    if (!candidate) {
      return { text: 'I apologize, but I could not formulate a response at this moment.' };
    }

    const parts = candidate.content?.parts || [];
    let text = '';
    const toolCalls: any[] = [];

    for (const part of parts) {
      if (part.text) {
        text += part.text;
      }
      if (part.functionCall) {
        toolCalls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: part.functionCall.name,
          args: part.functionCall.args || {},
        });
      }
    }

    return {
      text: text.trim(),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      rawParts: parts,
      finishReason: candidate.finishReason,
      usage: data.usageMetadata
        ? {
            promptTokens: data.usageMetadata.promptTokenCount,
            candidatesTokens: data.usageMetadata.candidatesTokenCount,
          }
        : undefined,
    };
  }
}
