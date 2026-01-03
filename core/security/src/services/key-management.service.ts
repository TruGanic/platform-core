// src/services/key-management.service.ts
import { config } from "@/config";

export class KeyManagementService {
  private privateKey: string | null = null;

  /**
   * Get the core service's private key
   * Currently supports environment variable storage
   * @returns The private key
   */
  async getPrivateKey(): Promise<string> {
    if (this.privateKey) {
      return this.privateKey;
    }

    // Get from environment variable
    const key = config.corePrivateKey;
    if (!key) {
      throw new Error("CORE_PRIVATE_KEY not found in environment variables");
    }

    // Remove 0x prefix if present
    this.privateKey = key.startsWith("0x") ? key.substring(2) : key;
    return this.privateKey;
  }

  /**
   * Clear cached private key (for testing/rotation)
   */
  clearCache(): void {
    this.privateKey = null;
  }
}

// Export singleton instance
export const keyManagementService = new KeyManagementService();
