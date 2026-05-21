import dotenv from 'dotenv';
dotenv.config();

console.log("Checking API key...");

async function check() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("No API key");
        return;
    }
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    if (data.error) {
        console.error("API Error:", data.error.message);
    } else if (data.models) {
        console.log("Available models:");
        data.models.map(m => console.log(m.name)).slice(0, 5);
    } else {
        console.log("Unknown response:", data);
    }
}
check();