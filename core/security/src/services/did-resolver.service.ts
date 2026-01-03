// src/services/did-resolver.service.ts
import { agent } from "@/lib/vermo";
import {
  DIDDocument,
  ResolveDIDRequest,
  ResolveDIDResponse,
} from "@shared/types";
import { initRedis } from "@/lib/cache";

export class DIDResolverService {
  private redis = initRedis();
  private cacheTTL = 3600; // 1 hour

  /**
   * Resolve DID to DID document
   */
  async resolveDID(request: ResolveDIDRequest): Promise<ResolveDIDResponse> {
    const { did } = request;

    // Check cache first
    const cached = await this.getCachedDID(did);
    if (cached) {
      return { did, document: cached, resolved: true };
    }

    try {
      // Resolve using Veramo
      const resolution = await agent.resolveDid({ didUrl: did });

      if (!resolution.didDocument) {
        return { did, document: {} as DIDDocument, resolved: false };
      }

      const document = resolution.didDocument as DIDDocument;

      // Cache the result
      await this.cacheDID(did, document);

      return { did, document, resolved: true };
    } catch (error: any) {
      console.error("DID resolution error:", error);
      return { did, document: {} as DIDDocument, resolved: false };
    }
  }

  /**
   * Get cached DID document
   */
  private async getCachedDID(did: string): Promise<DIDDocument | null> {
    try {
      const cached = await this.redis.get(`did:${did}`);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error("Cache read error:", error);
      return null;
    }
  }

  /**
   * Cache DID document
   */
  private async cacheDID(did: string, document: DIDDocument): Promise<void> {
    try {
      await this.redis.setex(
        `did:${did}`,
        this.cacheTTL,
        JSON.stringify(document)
      );
    } catch (error) {
      console.error("Cache write error:", error);
    }
  }

  /**
   * Invalidate cached DID (useful for testing or when DID is updated)
   */
  async invalidateCache(did: string): Promise<void> {
    try {
      await this.redis.del(`did:${did}`);
    } catch (error) {
      console.error("Cache invalidation error:", error);
    }
  }
}

// Export singleton instance
export const didResolverService = new DIDResolverService();
