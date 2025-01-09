import Groq from "groq-sdk";

export class GroqService {
    constructor() {
        this.groq = new Groq({
            apiKey: import.meta.env.VITE_GROQ_API_KEY
        });
    }

    async getChatCompletion(userMessage, systemPrompt = "You are a helpful assistant.") {
        try {
            const chatCompletion = await this.groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: systemPrompt,
                    },
                    {
                        role: "user",
                        content: userMessage,
                    },
                ],
                model: "llama-3.3-70b-versatile",
                temperature: 0.5,
                max_tokens: 1024,
                top_p: 1,
                stream: false,
            });

            return {
                content: chatCompletion.choices[0]?.message?.content || "",
                tokens: chatCompletion.usage?.total_tokens || 0,
                cost: this.calculateCost(chatCompletion.usage?.total_tokens || 0)
            };
        } catch (error) {
            console.error('Groq API error:', error);
            throw new Error('Failed to get chat completion');
        }
    }

    calculateCost(tokens) {
        // $0.03 per message in $GREMLINAI tokens
        // This is a placeholder conversion rate - adjust as needed
        const GREMLINAI_PER_USD = 100; // Example: 100 GREMLINAI = $1 USD
        const USD_PER_MESSAGE = 0.03;
        return USD_PER_MESSAGE * GREMLINAI_PER_USD;
    }
}
