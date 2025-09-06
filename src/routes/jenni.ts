import { Router } from "express";
import { checkEligibility } from "../core/eligibility.js";

export const jenni = Router();

jenni.get("/eligibility", async (req, res) => {
  const { zip, gtin, storeId = 'demo-store' } = req.query as any;
  if (!gtin || !zip) return res.status(400).json({ error: 'Missing gtin or zip' });
  try {
    const result = await checkEligibility({ zip, gtin, storeId });
    // Return full EligibilityResult to match /v1/availability
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : e });
  }
});
