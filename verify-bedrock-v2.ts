#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Standalone verification script for ITI Student Bedrock Gateway
 * Tests different base URL patterns
 */

interface GatewayTest {
  name: string;
  path: string;
  body: Record<string, unknown>;
}

const API_KEY = process.env.SBG_API_KEY;

if (!API_KEY) {
  console.error("❌ SBG_API_KEY is required");
  process.exit(1);
}
const BASE_URLS = [
  "https://apiaccess.iti.net.eg",
  "https://apiaccess.iti.net.eg/api/v1",
];

const TESTS: GatewayTest[] = [
  {
    name: "Chat",
    path: "/student/chat",
    body: {
      model_id: "anthropic.claude-sonnet-4-6",
      messages: [{ role: "user", content: "Say hello." }],
      temperature: 0.7,
      max_tokens: 50,
      stream: false
    }
  },
  {
    name: "Embed",
    path: "/student/embed",
    body: {
      model_id: "amazon.titan-embed-text-v2:0",
      input: ["test"]
    }
  },
  {
    name: "Image",
    path: "/student/generate-image",
    body: {
      model_id: "amazon.nova-canvas-v1:0",
      prompt: "test",
      n: 1,
      size: "512x512"
    }
  }
];

async function testUrl(baseUrl: string, test: GatewayTest): Promise<void> {
  const url = `${baseUrl}${test.path}`;
  const startTime = Date.now();
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(test.body),
    });
    
    const latency = Date.now() - startTime;
    const responseText = await response.text();
    
    console.log(`   ${baseUrl}${test.path}`);
    console.log(`   Status: ${response.status} | Latency: ${latency}ms`);
    if (response.ok) {
      console.log(`   ✅ SUCCESS - ${responseText.slice(0, 200)}`);
    } else {
      console.log(`   ❌ ${response.status}: ${responseText.slice(0, 300)}`);
    }
  } catch (error) {
    const latency = Date.now() - startTime;
    console.log(`   ${baseUrl}${test.path}`);
    console.log(`   ❌ NETWORK ERROR (${latency}ms): ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function run(): Promise<void> {
  console.log("Testing ITI Student Bedrock Gateway endpoints...\n");
  
  for (const baseUrl of BASE_URLS) {
    console.log(`\n=== Base URL: ${baseUrl} ===`);
    for (const test of TESTS) {
      await testUrl(baseUrl, test);
    }
  }
}

run().catch(console.error);
