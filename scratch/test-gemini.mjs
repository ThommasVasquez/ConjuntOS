import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config({ path: "./.env.local" });

const apiKey = process.env.GEMINI_API_KEY;
console.log("API Key exists:", !!apiKey);

const modelsToTest = [
  "gemini-1.5-flash-latest",
  "gemini-1.5-pro-latest",
  "gemini-pro",
  "gemini-1.5-pro",
  "gemini-2.0-flash",
  "gemini-2.5-flash"
];

async function run() {
  const genAI = new GoogleGenerativeAI(apiKey);
  
  for (const mName of modelsToTest) {
    try {
      console.log(`Testing model: ${mName}...`);
      const model = genAI.getGenerativeModel({ model: mName });
      const result = await model.generateContent("Dime hola en una sola palabra.");
      console.log(`✅ SUCCESS with ${mName}:`, result.response.text().trim());
      return; // Stop if one works
    } catch (err) {
      console.log(`❌ FAILED with ${mName}:`, err.message);
    }
  }
}

run();
