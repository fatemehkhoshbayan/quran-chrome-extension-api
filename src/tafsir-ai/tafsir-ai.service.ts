import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class TafsirService {
  private genAI: GoogleGenerativeAI;
  /** Gemini 1.5 IDs were retired; default to a current stable model. Override with GEMINI_MODEL. */
  private readonly modelName =
    process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async getExplanation(verseKey: string, text: string) {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.modelName });
      const prompt = `Provide a concise, 2-sentence Tafsir for Verse ${verseKey}: "${text}".`;

      const result = await model.generateContent(prompt);
      const response = result.response;

      return {
        explanation: response.text(),
        modelUsed: this.modelName,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Gemini API Error:', error);
      throw new InternalServerErrorException('Failed to generate Tafsir');
    }
  }
}
