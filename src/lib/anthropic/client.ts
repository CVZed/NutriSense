import Anthropic from "@anthropic-ai/sdk";

// Singleton — reused across server-side requests in the same process
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Model constants — one place to update when upgrading
export const MODELS = {
  // Chat, logging, onboarding, photo parsing — speed + quality balance
  chat: "claude-sonnet-4-6",
  // Insight generation — deeper pattern analysis
  insights: "claude-opus-4-6",
} as const;
