import { Router } from "express";
import { shopifyConnector } from "../connectors/shopify.js";

export const jenni = Router();

jenni.get("/eligibility", async (req, res) => {
  const { zip, upc, storeId, productGid } = req.query as any;
  try {
    const eligible = await shopifyConnector.extractEligibility(
      { zip, upc, storeId }, { productGid }
    );
    res.json({ eligible });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : e });
  }
});
