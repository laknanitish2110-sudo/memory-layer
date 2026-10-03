import type { ISO8601 } from "../memory/types.js";

export interface TokenFamily {
  family_id: string;
  binding_id: string;
  current_generation: number;
  created_at: ISO8601;
  revoked_at: ISO8601 | null;
}

export interface RefreshToken {
  token_hash: string;
  family_id: string;
  generation: number;
  issued_at: ISO8601;
  expires_at: ISO8601;
}

export interface AccessToken {
  token_hash: string;
  family_id: string;
  binding_id: string;
  issued_at: ISO8601;
  expires_at: ISO8601;
}

export type TokenRefreshResult =
  | {
      status: "rotated";
      access_token: AccessToken;
      refresh_token: RefreshToken;
      new_generation: number;
    }
  | {
      status: "reuse_detected";
      family_id: string;
      presented_generation: number;
      current_generation: number;
    };
