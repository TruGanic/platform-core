import { createAgent, IAgentOptions } from "@veramo/core";
import { DIDResolverPlugin } from "@veramo/did-resolver";
import { Resolver } from "did-resolver";
import { getResolver as webDidResolver } from "web-did-resolver";
import { log } from "@/lib/logger";

/**
 * Setup Veramo agent for DID/VC operations
 * This agent is used to resolve DIDs from various methods (did:web, did:key, etc.)
 */
export function createVeramoAgent() {
  // Create DID resolver with web-did-resolver (for did:web)
  const resolverConfig: any = {
    ...webDidResolver(),
  };

  // Try to add key-did-resolver if available (optional, for did:key support)
  try {
    const { getResolver: keyDidResolver } = require("key-did-resolver");
    Object.assign(resolverConfig, keyDidResolver());
  } catch (error) {
    log.warn("key-did-resolver not available, skipping did:key support");
  }

  // Create the resolver instance
  const resolver = new Resolver(resolverConfig);

  // Configure Veramo agent with DID resolver plugin
  const agentOptions: IAgentOptions = {
    plugins: [new DIDResolverPlugin({ resolver })],
  };

  return createAgent(agentOptions);
}

// Export a singleton agent instance
export const agent = createVeramoAgent();
