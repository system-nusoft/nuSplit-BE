import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';

export interface LineItem {
  name: string;
  amount: number;
}

export interface ReceiptScanResult {
  description: string;
  amount: number;
  currency: string;
  lineItems: LineItem[];
  confidence: number;
  rawText: string;
}

@Injectable()
export class AiService {
  private readonly client: Groq;
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly configService: ConfigService) {
    this.client = new Groq({
      apiKey: this.configService.getOrThrow<string>('GROQ_API_KEY'),
    });
  }

  async scanReceipt(imageBase64: string, mimeType: string): Promise<ReceiptScanResult> {
    const prompt = `You are an expert receipt parser for a bill-splitting app. Analyze this receipt image and extract the information.

Return ONLY a valid JSON object (no markdown, no extra text) with these exact fields:
{
  "description": "merchant or restaurant name",
  "amount": 0.00,
  "currency": "USD",
  "lineItems": [
    { "name": "item name", "amount": 0.00 }
  ],
  "confidence": 0.95,
  "rawText": "all text found on the receipt"
}

Rules:
- description should be the merchant/store name
- amount must be the total amount paid (a number)
- currency should be a 3-letter ISO code (default to USD if not visible)
- lineItems should list individual items with their prices (empty array if not visible)
- confidence is a float 0.0–1.0 indicating extraction confidence
- Return ONLY the JSON object, nothing else`;

    const completion = await this.client.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    const responseText = completion.choices[0]?.message?.content ?? '';

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      const parsed = JSON.parse(jsonMatch[0]) as ReceiptScanResult;
      return {
        description: parsed.description || 'Unknown',
        amount: typeof parsed.amount === 'number' ? parsed.amount : 0,
        currency: parsed.currency || 'USD',
        lineItems: Array.isArray(parsed.lineItems) ? parsed.lineItems : [],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        rawText: parsed.rawText || responseText,
      };
    } catch (error) {
      this.logger.error('Failed to parse AI receipt response', error);
      return {
        description: 'Unknown',
        amount: 0,
        currency: 'USD',
        lineItems: [],
        confidence: 0,
        rawText: responseText,
      };
    }
  }
}
