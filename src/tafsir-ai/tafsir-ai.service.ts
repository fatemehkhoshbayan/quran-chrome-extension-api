import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { stripHtmlTags } from './utils/stripHtmlTags';

@Injectable()
export class TafsirService {
  private genAI: GoogleGenerativeAI;
  private readonly modelName =
    process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
  private readonly maxRetries = 2;

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

  async getExplanation(
    chapter_name: string,
    verseKey: string,
    text: string,
    tafsirHtml: string,
    question?: string,
  ) {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.modelName });
      const cleanedTafsir = stripHtmlTags(tafsirHtml || '');
      const boundedTafsir = cleanedTafsir.slice(0, 8_000);
      const userQuestion = question?.trim();
      const prompt = `
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
      ${userQuestion || 'No specific question provided. Give a concise general explanation.'}

      Instructions:
      1) Answer in 2-4 concise sentences.
      2) Focus directly on the user question when provided.
      3) Keep the explanation faithful to the supplied tafsir context.
      4) If the question asks for info not present in the context, explicitly say it is not in the provided tafsir.
      5) Do not output raw HTML in the answer.
      `.trim();

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
          // Exponential backoff for temporary Gemini capacity/rate-limit issues.
          await this.sleep(700 * 2 ** attempt);
        }
      }

      if (!result) {
        throw lastError ?? new Error('Gemini response was not generated');
      }
      const response = result.response;

      return {
        explanation: response.text(),
        modelUsed: this.modelName,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Gemini API Error:', error);
      if (this.isTransientGeminiError(error)) {
        throw new ServiceUnavailableException(
          'Tafsir model is temporarily busy. Please try again shortly.',
        );
      }
      throw new InternalServerErrorException('Failed to generate Tafsir');
    }
  }
}
