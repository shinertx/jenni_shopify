# JENNi API Integration Update

## What was updated:

### 1. Environment Variables (.env.example)
- Changed from `JENNI_API_KEY` to OAuth2 credentials:
  - `JENNI_CLIENT_ID=111038`
  - `JENNI_CLIENT_SECRET=46c3a03e-fbe0-4ae8-b74f-455f11246f91`
- Updated API host to: `JENNI_API_HOST=http://35.209.65.82:8082`

### 2. Core Types (src/core/types.ts)
- Changed `upc` to `gtin` in all interfaces
- Added new JENNi-specific types:
  - `JenniTokenResponse` for OAuth2 tokens
  - `JenniProduct` and `JenniVariant` for API responses

### 3. Eligibility Service (src/core/eligibility.ts)
- Implemented OAuth2 authentication with token caching
- Updated to use new API endpoint: `/api/sku-graph/product-availability-service/searchProducts/`
- Changed logic to check `zipcode_inventory` for availability

### 4. Order Service (src/core/order.ts)
- Added OAuth2 authentication
- Noted that order submission endpoint needs to be confirmed with JENNi

### 5. API Routes (src/routes/jenni.ts)
- Changed query parameter from `upc` to `gtin`

### 6. Shopify Connector (src/connectors/shopify.ts)
- Updated order mapping to use `gtin` instead of `upc`

### 7. Frontend Widget (extensions/jenni-availability-widget/assets/widget.js)
- Updated to look for GTIN field first, fallback to SKU
- Changed API call to use `gtin` parameter

### 8. Test Script (scripts/testJenniAPI.ts)
- Created comprehensive test script to verify API functionality

## Key Changes in API Integration:

### Authentication
**Old:** Simple API key in headers
```typescript
headers: { "x-api-key": JENNI_API_KEY }
```

**New:** OAuth2 Bearer token
```typescript
headers: { "Authorization": `Bearer ${token}` }
```

### Product Identification
**Old:** Used UPC/SKU for product identification
**New:** Uses GTIN (Global Trade Item Number) which is more standardized

### Availability Check
**Old:** Simple eligibility boolean from `/v1/search`
**New:** Complex product search with inventory by ZIP code from `/api/sku-graph/product-availability-service/searchProducts/`

### Data Structure
**Old:** Direct eligibility response
**New:** Product catalog with variants and zipcode-specific inventory

## Next Steps:

1. **Install Dependencies:** Run `npm install` to install required packages
2. **Set Environment Variables:** Copy values from `.env.example` to `.env`
3. **Test API Connection:** Run `npm run test:jenni-api` (need to add this script)
4. **Verify GTIN Mapping:** Ensure Shopify products have proper GTIN/SKU values
5. **Order Endpoint:** Confirm with JENNi team about order submission endpoint
6. **Test Integration:** Full end-to-end testing with real Shopify store

## Benefits of New API:

1. **More Accurate Inventory:** ZIP-code specific inventory levels
2. **Better Product Data:** Rich product information with variants
3. **Standardized IDs:** GTIN is globally recognized standard
4. **Scalable Auth:** OAuth2 tokens can be refreshed and managed better
5. **Real-time Data:** More detailed product and availability information
