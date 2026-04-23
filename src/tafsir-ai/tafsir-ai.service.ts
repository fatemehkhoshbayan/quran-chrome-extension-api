import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { stripHtmlTags } from './utils/stripHtmlTags';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_MODEL = 'qwen/qwen3-next-80b-a3b-instruct:free';

@Injectable()
export class TafsirService {
  private genAI: GoogleGenerativeAI;
  private readonly modelName =
    process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
  private readonly openRouterModel =
    process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
  private readonly openRouterFallbackModel =
    process.env.OPENROUTER_FALLBACK_MODEL?.trim();
  private readonly openRouterApiKey = process.env.OPENROUTER_API_KEY?.trim();
  private readonly maxRetries = 2;
  private readonly openRouterMaxRetries = 4;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  private isTransientGeminiError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }
    const maybeError = error as { status?: number };
    return maybeError.status === 429 || maybeError.status === 503;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private buildPrompt(
    chapter_name: string,
    verseKey: string,
    text: string,
    tafsirHtml: string,
    boundedTafsir: string,
    userQuestion: string | undefined,
  ): string {
    return `
      You are a Quran explanation assistant.
      Your answer MUST be grounded in the provided verse and tafsir context.
      Treat the tafsir context as the primary source of truth for this response.
      Do not invent details beyond the provided context. If context is missing, say that clearly.

      Verse reference: ${verseKey}
      Chapter: ${chapter_name}
      Verse text: "${text}"

      Tafsir context (original HTML):
      ${tafsirHtml || 'No tafsir HTML provided.'}

      Tafsir context (plain text extracted from HTML):
      ${boundedTafsir || 'No readable tafsir text available after HTML cleanup.'}

      User question:
      ${userQuestion?.trim() || 'No specific question provided. Give a concise general explanation.'}

      Instructions:
      1) Answer in 2-4 concise sentences.
      2) Focus directly on the user question when provided.
      3) Keep the explanation faithful to the supplied tafsir context.
      4) If the question asks for info not present in the context, explicitly say it is not in the provided tafsir.
      5) Do not output raw HTML in the answer.
      `.trim();
  }

  private async generateWithGemini(prompt: string): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: this.modelName });
    let result: Awaited<ReturnType<typeof model.generateContent>> | undefined;
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        result = await model.generateContent(prompt);
        break;
      } catch (error) {
        lastError = error;
        if (
          !this.isTransientGeminiError(error) ||
          attempt === this.maxRetries
        ) {
          throw error;
        }
        await this.sleep(700 * 2 ** attempt);
      }
    }

    if (!result) {
      throw lastError ?? new Error('Gemini response was not generated');
    }
    return result.response.text();
  }

  private isTransientOpenRouterStatus(status: number): boolean {
    return status === 429 || status === 503;
  }

  private async openRouterChatRequest(
    prompt: string,
    model: string,
  ): Promise<Response> {
    if (!this.openRouterApiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }
    return fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.openRouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  }

  /**
   * Retries on 429/503 — free models and shared keys are often briefly saturated.
   */
  private async generateWithOpenRouter(
    prompt: string,
    model: string,
  ): Promise<string> {
    let lastBody = '';

    for (let attempt = 0; attempt <= this.openRouterMaxRetries; attempt += 1) {
      const res = await this.openRouterChatRequest(prompt, model);

      if (res.ok) {
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string | null } }>;
        };
        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== 'string') {
          throw new Error('OpenRouter response had no message content');
        }
        return content;
      }

      lastBody = await res.text();
      const transient = this.isTransientOpenRouterStatus(res.status);
      if (!transient || attempt === this.openRouterMaxRetries) {
        throw new Error(
          `OpenRouter request failed: ${res.status} ${res.statusText} ${lastBody.slice(0, 500)}`,
        );
      }
      await this.sleep(2000 * 2 ** attempt);
    }

    throw new Error(`OpenRouter exhausted retries: ${lastBody.slice(0, 300)}`);
  }

  private async tryOpenRouterModels(
    prompt: string,
  ): Promise<{ text: string; modelUsed: string }> {
    try {
      const text = await this.generateWithOpenRouter(
        prompt,
        this.openRouterModel,
      );
      return { text, modelUsed: this.openRouterModel };
    } catch (primaryErr) {
      if (!this.openRouterFallbackModel) {
        throw primaryErr;
      }
      console.warn(
        `OpenRouter primary model failed (${this.openRouterModel}), trying fallback:`,
        primaryErr,
      );
      const text = await this.generateWithOpenRouter(
        prompt,
        this.openRouterFallbackModel,
      );
      return { text, modelUsed: this.openRouterFallbackModel };
    }
  }

  async getExplanation(
    chapter_name: string,
    verseKey: string,
    text: string,
    tafsirHtml: string,
    question?: string,
  ) {
    const cleanedTafsir = stripHtmlTags(tafsirHtml || '');
    const boundedTafsir = cleanedTafsir.slice(0, 8_000);
    const prompt = this.buildPrompt(
      chapter_name,
      verseKey,
      text,
      tafsirHtml,
      boundedTafsir,
      question,
    );

    let geminiError: unknown;
    let geminiText: string | undefined;

    try {
      geminiText = await this.generateWithGemini(prompt);
    } catch (error) {
      geminiError = error;
      console.error('Gemini API Error:', error);
    }

    const geminiOk = Boolean(geminiText?.trim());
    if (geminiOk) {
      return {
        explanation: geminiText!.trim(),
        modelUsed: this.modelName,
        generatedAt: new Date().toISOString(),
      };
    }

    if (this.openRouterApiKey) {
      try {
        const { text, modelUsed } = await this.tryOpenRouterModels(prompt);
        if (text.trim()) {
          return {
            explanation: text.trim(),
            modelUsed,
            generatedAt: new Date().toISOString(),
          };
        }
      } catch (openRouterErr) {
        console.error('OpenRouter fallback error:', openRouterErr);
      }
    }

    if (geminiError) {
      if (this.isTransientGeminiError(geminiError)) {
        throw new ServiceUnavailableException(
          'Tafsir AI is rate-limited or temporarily unavailable. Gemini free tier has strict per-day limits (https://ai.google.dev/gemini-api/docs/rate-limits), and OpenRouter free models can return 429 when upstream is busy. Retry later, enable billing on Gemini for higher quotas, or set OPENROUTER_FALLBACK_MODEL to a paid or non-saturated OpenRouter model.',
        );
      }
      throw new InternalServerErrorException('Failed to generate Tafsir');
    }

    throw new InternalServerErrorException('Failed to generate Tafsir');
  }
}
