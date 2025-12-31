/**
 * Plugin Registration Types
 */

export interface PluginEndpoint {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  description?: string;
}

export interface PluginInstance {
  id: string;
  name: string;
  version: string;
  endpoints: PluginEndpoint[];
  [key: string]: any;
}
