import { Router } from "express";
import type { Request, Response } from "express";

export const gdpr = Router();

// customers/data_request
// https://shopify.dev/docs/apps/store/data-protection/webhooks

gdpr.post("/customers/data_request", (req: Request, res: Response) => {
  // Respond with 200; optionally log the request for auditing.
  res.status(200).end();
});

gdpr.post("/customers/redact", (req: Request, res: Response) => {
  res.status(200).end();
});

gdpr.post("/shop/redact", (req: Request, res: Response) => {
  res.status(200).end();
});
