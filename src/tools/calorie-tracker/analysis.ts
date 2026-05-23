import { AIClient } from '@js/ai';

export type AIAnalysisResult = {
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
  notes: string;
};

// Convert Blob to base64 helper
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Visual meal scanner leveraging our generic backend AI API.
 */
export async function performAIAnalysis(
  activeImageBlob: Blob,
  userHint: string
): Promise<AIAnalysisResult> {
  const base64 = await blobToBase64(activeImageBlob);

  const prompt = `Analyze this food meal photo and estimate its total nutritional content. ${
    userHint ? `Context clue provided by user: "${userHint}"` : ''
  } Provide logical, accurate calories, protein, carbs, and fat estimations.`;

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      foodName: { type: 'STRING', description: 'Brief description of the meal' },
      calories: { type: 'INTEGER', description: 'Estimated energy in kcal' },
      protein: { type: 'INTEGER', description: 'Estimated protein weight in grams' },
      carbs: { type: 'INTEGER', description: 'Estimated carbohydrates weight in grams' },
      fat: { type: 'INTEGER', description: 'Estimated lipids weight in grams' },
      confidence: { type: 'INTEGER', description: 'Estimation confidence rating from 1 to 100' },
      notes: {
        type: 'STRING',
        description: 'Breakdown explanation of food portions or components detected',
      },
    },
    required: ['foodName', 'calories', 'protein', 'carbs', 'fat', 'confidence', 'notes'],
  };

  const systemInstruction =
    'You are an advanced clinical nutritionist AI. You specialize in visually scanning dishes, estimating portion weights, and breaking down total nutritional content into precise calorie and macronutrient (protein, carbohydrates, lipid fat) totals.';

  const resultText = await AIClient.generate({
    prompt,
    systemInstruction,
    jsonMode: true,
    responseSchema,
    images: [
      {
        inlineData: {
          mimeType: activeImageBlob.type,
          data: base64,
        },
      },
    ],
  });

  const parsed = JSON.parse(resultText);

  return {
    foodName: parsed.foodName || 'Meal',
    calories: Number(parsed.calories) || 0,
    protein: Number(parsed.protein) || 0,
    carbs: Number(parsed.carbs) || 0,
    fat: Number(parsed.fat) || 0,
    confidence: Number(parsed.confidence) || 85,
    notes: parsed.notes || '',
  };
}
