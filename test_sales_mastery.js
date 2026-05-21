import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_KEY) {
    console.error("Missing OPENROUTER_API_KEY");
    process.exit(1);
}

const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: OPENROUTER_KEY,
});

const salesSystemPrompt = `You are a top-tier B2B SaaS Sales Development Representative (SDR) for Zentia AI. 
Zentia AI is a platform that allows users to deploy autonomous AI agents on Telegram to handle top-of-funnel sales and book meetings.
Your goal is to qualify leads, handle objections smoothly, and push for a demo meeting.
Your tone is professional, confident, concise, and persuasive. 
Do not be overly pushy, but always guide the conversation towards a calendar booking.
Acknowledge the user's pain points and pivot to how Zentia AI solves them.`;

const testScenarios = [
    {
        name: "Objection: Price",
        prompt: "To be honest, $149/mo for the Pro plan seems a bit steep for us right now. We are a small team of 3."
    },
    {
        name: "Objection: Competition",
        prompt: "We are already using a standard chatbot builder (like ManyChat). Why should we switch to Zentia AI?"
    },
    {
        name: "Buying Signal: Qualification",
        prompt: "I spend about 4 hours a day just qualifying junk leads on Telegram before passing them to my closers. It's exhausting."
    },
    {
        name: "Direct Question: Capabilities",
        prompt: "Can your bots actually update our HubSpot CRM, or do I have to copy-paste data manually?"
    }
];

async function runMasteryTest() {
    console.log("🚀 Starting Sales Mastery Evaluation...\n");
    console.log("=========================================");
    console.log("System Persona: Top-tier B2B SaaS SDR for Zentia AI");
    console.log("=========================================\n");

    for (const [index, scenario] of testScenarios.entries()) {
        console.log(`\n🧪 Test ${index + 1}: ${scenario.name}`);
        console.log(`👤 Prospect says: "${scenario.prompt}"`);
        console.log("⏳ Waiting for AI SDR response...");

        try {
            const start = Date.now();
            const completion = await openai.chat.completions.create({
                model: "google/gemini-2.5-flash", // Using the default fast model
                messages: [
                    { role: "system", content: salesSystemPrompt },
                    { role: "user", content: scenario.prompt }
                ],
                temperature: 0.7,
                max_tokens: 300,
            });
            const latency = Date.now() - start;
            const reply = completion.choices[0].message.content;

            console.log(`🤖 AI SDR Replies (${latency}ms):`);
            console.log(`\x1b[36m"${reply.trim()}"\x1b[0m`);
            
            // Brief automated evaluation text
            console.log("✅ Check: Did it handle the objection? Did it push for a meeting?");

        } catch (error) {
            console.error(`❌ Error testing scenario: ${error.message}`);
        }
        console.log("-----------------------------------------");
    }
    console.log("\n🎯 Mastery Evaluation Complete.");
}

runMasteryTest();