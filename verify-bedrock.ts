#!/usr/bin/env node
/**
 * Standalone verification script for ITI Student Bedrock Gateway
 * Tests: chat, embeddings, image generation
 * 
 * Usage:
 *   SBG_API_KEY=your_key SBG_BASE_URL=https://apiaccess.iti.net.eg npx tsx verify-bedrock.ts
 */

import { createHash } from "node:crypto";

const API_KEY = process.env.SBG_API_KEY;
const BASE_URL = process.env.SBG_BASE_URL;

if (!API_KEY || !BASE_URL) {
  console.error("❌ Missing required environment variables:");
  console.error("   SBG_API_KEY - Your Student Bedrock Gateway API key");
  console.error("   SBG_BASE_URL - Base URL (e.g., https://apiaccess.iti.net.eg)");
  process.exit(1);
}

// Ensure base URL doesn't have trailing slash
const baseUrl = BASE_URL.replace(/\/+$/, "");

async function makeRequest(endpoint: string, body: any, description: string): Promise<void> {
  const url = `${baseUrl}/api/v1/student${endpoint}`;
  const startTime = Date.now();
  
  console.log(`\n📡 ${description}`);
  console.log(`   URL: ${url}`);
  console.log(`   Method: POST`);
  console.log(`   Model: ${body.model_id}`);
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    
    const latency = Date.now() - startTime;
    const responseText = await response.text();
    
    console.log(`   HTTP Status: ${response.status} ${response.statusText}`);
    console.log(`   Latency: ${latency}ms`);
    
    if (response.ok) {
      try {
        const json = JSON.parse(responseText);
        console.log(`   Response: ${JSON.stringify(json, null, 2).slice(0, 500)}`);
      } catch {
        console.log(`   Response: ${responseText.slice(0, 500)}`);
      }
      console.log(`   ✅ SUCCESS`);
    } else {
      console.log(`   Response: ${responseText}`);
      console.log(`   ❌ FAILED`);
    }
  } catch (error) {
    const latency = Date.now() - startTime;
    console.log(`   Latency: ${latency}ms`);
    console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`   ❌ NETWORK ERROR`);
  }
}

async function runVerification(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  ITI Student Bedrock Gateway Verification");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`Base URL: ${baseUrl}`);
  console.log(`API Key: ${API_KEY.slice(0, 8)}...${API_KEY.slice(-4)}`);
  
  // Test 1: Chat
  await makeRequest(
    "/chat",
    {
      model_id: "anthropic.claude-sonnet-4-6",
      messages: [
        { role: "user", content: "Say hello in one sentence." }
      ],
      temperature: 0.7,
      max_tokens: 100,
      stream: false
    },
    "TEST 1: Chat Completion"
  );
  
  // Test 2: Embeddings
  await makeRequest(
    "/embed",
    {
      model_id: "amazon.titan-embed-text-v2:0",
      input: ["Hello world", "Test embedding"]
    },
    "TEST 2: Embeddings"
  );
  
  // Test 3: Image Generation
  await makeRequest(
    "/generate-image",
    {
      model_id: "amazon.nova-canvas-v1:0",
      prompt: "A beautiful sunset over mountains",
      n: 1,
      size: "1024x1024"
    },
    "TEST 3: Image Generation"
  );
  
  // Test 4: Audio (if model available)
  await makeRequest(
    "/audio",
    {
      model_id: "amazon.nova-sonic-v1:0",
      input: "Hello, this is a test.",
      voice: "alloy"
    },
    "TEST 4: Audio Generation"
  );
  
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Verification Complete");
  console.log("═══════════════════════════════════════════════════════");
}

runVerification().catch(console.error);
