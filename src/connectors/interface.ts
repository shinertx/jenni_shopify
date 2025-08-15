import { EligibilityQuery, JenniOrder } from "../core/types.js";

export interface Connector {
  platform: string;
  verifyWebhook(rawBody: Buffer, hmac: string): boolean;
  extractEligibility(q: EligibilityQuery, platformData: any): Promise<boolean>;
  forwardOrder(order: any): Promise<JenniOrder>;
  updateStatus(jenniStatus: any): Promise<void>;
  syncProduct?(product: any): Promise<void>;
}
