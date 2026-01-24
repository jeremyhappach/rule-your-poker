import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TriviaQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  category: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { category } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const categories = [
      "NFL football", "NBA basketball", "MLB baseball", "NHL hockey", "soccer",
      "world geography", "US geography", "capital cities",
      "movies", "TV shows", "music", "celebrities",
      "world history", "American history", "ancient civilizations",
      "general science", "space and astronomy", "animals and nature",
      "food and drink", "art and literature", "pop culture"
    ];
    
    const selectedCategory = category || categories[Math.floor(Math.random() * categories.length)];
    
    const systemPrompt = `You are a trivia question generator. Generate medium difficulty trivia questions that are challenging but not obscure. Focus on well-known facts that knowledgeable people would know. Always provide exactly 4 distinct answer options with only one correct answer.`;

    const userPrompt = `Generate a single ${selectedCategory} trivia question with exactly 4 answer options. The question should be medium difficulty - not too easy, not too hard. Make it interesting and fun.

Return the response using the trivia_question function.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "trivia_question",
              description: "Return a sports trivia question with 4 options",
              parameters: {
                type: "object",
                properties: {
                  question: { 
                    type: "string",
                    description: "The trivia question text"
                  },
                  options: {
                    type: "array",
                    items: { type: "string" },
                    description: "Exactly 4 answer options"
                  },
                  correctIndex: {
                    type: "number",
                    description: "The 0-based index of the correct answer (0-3)"
                  },
                  category: {
                    type: "string",
                    description: "The sport category (e.g., NFL, NBA, MLB, NHL, Soccer)"
                  }
                },
                required: ["question", "options", "correctIndex", "category"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "trivia_question" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    
    // Extract the function call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "trivia_question") {
      throw new Error("Invalid response format from AI");
    }

    const triviaData: TriviaQuestion = JSON.parse(toolCall.function.arguments);

    // Validate the response
    if (!triviaData.question || !triviaData.options || triviaData.options.length !== 4 || 
        triviaData.correctIndex < 0 || triviaData.correctIndex > 3) {
      throw new Error("Invalid trivia data format");
    }

    return new Response(
      JSON.stringify(triviaData),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("generate-trivia error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
