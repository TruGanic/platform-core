/**
 * Security Types - DID and Verifiable Credentials
 */

export interface DIDDocument {
  "@context": string | string[];
  id: string;
  verificationMethod?: VerificationMethod[];
  authentication?: string[] | VerificationMethod[];
  service?: ServiceEndpoint[];
  [key: string]: any;
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyJwk?: any;
  publicKeyMultibase?: string;
  [key: string]: any;
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string;
  [key: string]: any;
}

export interface ResolveDIDRequest {
  did: string;
}

export interface ResolveDIDResponse {
  did: string;
  document: DIDDocument;
  resolved: boolean;
}

export interface VerifiableCredential {
  "@context": string | string[];
  type: string | string[];
  issuer: string | { id: string };
  credentialSubject: CredentialSubject;
  issuanceDate: string;
  expirationDate?: string;
  proof?: Proof;
  [key: string]: any;
}

export interface CredentialSubject {
  id: string;
  pluginId: string;
  permissions: string[];
  version?: string;
  [key: string]: any;
}

export interface Proof {
  type: string;
  created: string;
  proofPurpose: string;
  verificationMethod: string;
  jws?: string;
  proofValue?: string;
  [key: string]: any;
}

export interface IssueVCRequest {
  pluginId: string;
  did: string;
  permissions: string[];
  version?: string;
  expirationDate?: string;
}

export interface IssueVCResponse {
  success: boolean;
  vc: VerifiableCredential;
  message?: string;
}

export interface VerifyVCRequest {
  vc: VerifiableCredential | string; // Can be object or JWT string
}

export interface VerifyVCResponse {
  valid: boolean;
  vc?: VerifiableCredential;
  permissions?: string[];
  error?: string;
}

export interface AuthenticateRequest {
  did: string;
  signature: string;
  request: {
    method: string;
    path: string;
    body?: any;
    headers?: Record<string, string>;
    timestamp: string;
    nonce: string;
  };
}

export interface AuthenticateResponse {
  valid: boolean;
  permissions?: string[];
  error?: string;
}

export interface AuthorizeRequest {
  did: string;
  action: string;
  resource: string;
  context?: Record<string, any>;
}

export interface AuthorizeResponse {
  authorized: boolean;
  reason?: string;
}
