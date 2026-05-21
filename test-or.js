import OpenAI from 'openai';
import * as dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

async function main() {
  try {
    const completion = await openai.chat.completions.create({
      model: "google/gemini-2.5-flash",
      max_tokens: 500,
      messages: [
        { role: "user", content: "Say hello!" }
      ],
    });

    console.log("Success:", completion.choices[0].message.content);
  } catch (e) {
    console.error("Error:", e.message);
  }
}

main();