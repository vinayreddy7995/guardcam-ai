import { GoogleGenAI, Type } from '@google/genai';
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { base64Data, transcriptText } = await req.json();

    // Access key securely from server-side environment variables
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Server configuration error: GEMINI_API_KEY environment variable is missing.' },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const candidateModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

    const promptText = `You are a real-time Cybersecurity and AI Deepfake Defense Scanner.
    
    Examine this video frame and live audio transcript: "${transcriptText}".

    DETERMINE IF THIS FEED SHOWS ANY OF THE FOLLOWING THREATS:
    1. AI Deepfake / Synthetic Face: Unnatural lip-sync, blurriness around edges, distorted facial features, strange lighting.
    2. Impersonation Scam: Fake police, law enforcement, bank officials, government agents, tech support, or authority figures.
    3. Social Engineering / Coercion: Demanding urgent money transfers, gift cards, passwords, OTPs, Aadhaar/SSN verification, or threats of legal/police action.

    CRITICAL RULE FOR DEMONSTRATIONS:
    If there is ANY presence of uniforms, authority badges, financial demands, urgent threats, synthetic visuals, or suspect speech, mark isScam: true and set threatScore above 80.`;

    const payload = {
      contents: [
        { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
        promptText,
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isScam: { type: Type.BOOLEAN },
            threatScore: { type: Type.NUMBER },
            scamCategory: { type: Type.STRING },
            detectedVisuals: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            incidentSummary: { type: Type.STRING },
          },
          required: [
            'isScam',
            'threatScore',
            'scamCategory',
            'detectedVisuals',
            'incidentSummary',
          ],
        },
      },
    };

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          ...payload,
        });

        const result = JSON.parse(response.text);
        return NextResponse.json(result);
      } catch (err) {
        console.warn(`Model ${modelName} failed on server, trying fallback...`, err);
      }
    }

    return NextResponse.json(
      { error: 'All Gemini model endpoints are currently busy. Please retry.' },
      { status: 503 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Server error processing frame analysis.' },
      { status: 500 }
    );
  }
}