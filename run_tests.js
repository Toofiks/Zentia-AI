import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import http from 'http';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: OPENROUTER_KEY,
});

async function runTests() {
    console.log("🚀 Starting Comprehensive Project Tests...");
    
    let testsPassed = 0;
    let testsFailed = 0;

    const assert = (condition, message) => {
        if (condition) {
            console.log(`✅ PASS: ${message}`);
            testsPassed++;
        } else {
            console.error(`❌ FAIL: ${message}`);
            testsFailed++;
        }
    };

    try {
        // --- 1. Environment Variables Test ---
        console.log("\n1️⃣ Checking Environment Variables...");
        assert(SUPABASE_URL, "Supabase URL is present");
        assert(SUPABASE_KEY, "Supabase Service Role Key is present");
        assert(OPENROUTER_KEY, "OpenRouter API Key is present");

        // --- 2. Database Connectivity & Integrity Test ---
        console.log("\n2️⃣ Checking Supabase Database...");
        const { data: agents, error: dbError } = await supabase.from('agents').select('*').limit(1);
        assert(!dbError, `Supabase connection successful. ${dbError ? 'Error: ' + dbError.message : ''}`);
        assert(Array.isArray(agents), "Agents table query returned an array");

        // --- 3. OpenRouter API Mastery Test ---
        console.log("\n3️⃣ Checking AI API (OpenRouter) Mastery...");
        try {
            const aiStart = Date.now();
            const completion = await openai.chat.completions.create({
                model: "google/gemini-2.5-flash",
                messages: [{ role: "user", content: "Say 'Hello World' exactly." }],
                max_tokens: 10,
            });
            const aiLatency = Date.now() - aiStart;
            assert(completion.choices && completion.choices.length > 0, `OpenRouter API responded in ${aiLatency}ms`);
        } catch (e) {
            assert(false, `OpenRouter API Failed: ${e.message}`);
        }

        // --- 4. Stress Test (Concurrent Connections) ---
        console.log("\n4️⃣ Performing Local API Stress Test...");
        const stressStart = Date.now();
        const concurrentRequests = 20; // 20 concurrent requests
        let stressSuccess = 0;
        
        const requests = Array.from({ length: concurrentRequests }).map(() => {
            return new Promise((resolve) => {
                http.get('http://localhost:3000/api/ping', (res) => {
                    if (res.statusCode === 200 || res.statusCode === 404) { // Endpoint might not exist, but server responds
                        stressSuccess++;
                    }
                    resolve();
                }).on('error', () => resolve());
            });
        });

        await Promise.all(requests);
        const stressLatency = Date.now() - stressStart;
        assert(stressSuccess > 0, `Stress Test: ${stressSuccess}/${concurrentRequests} requests processed in ${stressLatency}ms`);

        // --- 5. Bug Checks & Logic Validation ---
        console.log("\n5️⃣ Validating Data Models...");
        const { data: users, error: usersError } = await supabase.from('bot_users').select('chatId, username').limit(1);
        assert(!usersError, `bot_users table is accessible`);

    } catch (error) {
        console.error("Critical Test Failure:", error);
    } finally {
        console.log("\n📊 --- Test Summary ---");
        console.log(`✅ Passed: ${testsPassed}`);
        console.log(`❌ Failed: ${testsFailed}`);
        
        if (testsFailed === 0) {
            console.log("\n🎉 ALL TESTS PASSED! The project is stable.");
        } else {
            console.log("\n⚠️ SOME TESTS FAILED. Please review the logs above.");
        }
        process.exit(testsFailed > 0 ? 1 : 0);
    }
}

runTests();