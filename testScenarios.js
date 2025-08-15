import "dotenv/config";
import axios from "axios";

const JENNI_CLIENT_ID = process.env.JENNI_CLIENT_ID || "111038";
const JENNI_CLIENT_SECRET = process.env.JENNI_CLIENT_SECRET || "46c3a03e-fbe0-4ae8-b74f-455f11246f91";
const JENNI_API_HOST = process.env.JENNI_API_HOST || "http://35.209.65.82:8082";

async function testSpecificScenarios() {
  // Get token first
  const authResponse = await axios.post(
    `${JENNI_API_HOST}/api/sku-graph/product-availability-service/auth/token`,
    {
      client_id: JENNI_CLIENT_ID,
      client_secret: JENNI_CLIENT_SECRET
    }
  );
  
  const accessToken = authResponse.data.access_token;
  console.log("🔑 Access token obtained\n");

  // Test real-world scenarios from the data we just got
  const scenarios = [
    {
      name: "Dallas ZIP Code (75062) - Nike Socks available",
      test: { zip: "75062", brand: "Nike" }
    },
    {
      name: "NYC ZIP Code (10001) - Should have no products",
      test: { zip: "10001", brand: "Nike" }
    },
    {
      name: "Specific GTIN + ZIP combo that works",
      test: { gtin: "009328295433", zip: "75062" }
    },
    {
      name: "Specific GTIN + ZIP combo that doesn't work",
      test: { gtin: "009328295433", zip: "10001" }
    },
    {
      name: "Search all Adidas products",
      test: { brand: "Adidas" }
    },
    {
      name: "Get categories",
      endpoint: "/api/sku-graph/product-availability-service/getList/",
      method: "GET",
      params: { type: "category" }
    },
    {
      name: "Get brands",
      endpoint: "/api/sku-graph/product-availability-service/getList/",
      method: "GET", 
      params: { type: "brand" }
    }
  ];

  for (const scenario of scenarios) {
    try {
      console.log(`🧪 ${scenario.name}`);
      
      let response;
      if (scenario.method === "GET") {
        response = await axios.get(
          `${JENNI_API_HOST}${scenario.endpoint}`,
          {
            params: scenario.params,
            headers: { "Authorization": `Bearer ${accessToken}` },
            timeout: 10000
          }
        );
      } else {
        response = await axios.post(
          `${JENNI_API_HOST}/api/sku-graph/product-availability-service/searchProducts/`,
          { ...scenario.test, page: 1, page_size: 5 },
          {
            headers: { 
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            },
            timeout: 10000
          }
        );
      }
      
      if (scenario.method === "GET") {
        console.log(`✅ Success! Found:`, response.data);
      } else {
        console.log(`✅ Success! Found ${response.data.total_products} products`);
        
        if (response.data.products && response.data.products.length > 0) {
          const product = response.data.products[0];
          console.log(`   First product: ${product.title} ($${product.variants[0]?.price})`);
          
          if (product.variants && product.variants.length > 0) {
            const variant = product.variants[0];
            console.log(`   GTIN: ${variant.gtin}`);
            console.log(`   ZIP Inventory:`, variant.zipcode_inventory);
          }
        }
      }
      
    } catch (error) {
      console.log(`❌ ${scenario.name} failed!`);
      console.log(`   Status: ${error.response?.status}`);
      if (error.response?.data?.detail) {
        console.log(`   Error: ${error.response.data.detail.message}`);
      }
    }
    console.log();
  }

  // Now let's simulate a real Shopify integration scenario
  console.log("🏪 SHOPIFY INTEGRATION SIMULATION");
  console.log("=====================================");
  
  try {
    // Customer in Dallas (75062) wants to check if Nike socks are available
    const customerZip = "75062";
    const productGtin = "009328295433"; // Nike socks from our data
    
    console.log(`Customer ZIP: ${customerZip}`);
    console.log(`Product GTIN: ${productGtin}`);
    
    const eligibilityResponse = await axios.post(
      `${JENNI_API_HOST}/api/sku-graph/product-availability-service/searchProducts/`,
      { gtin: productGtin, zip: customerZip, page: 1, page_size: 1 },
      {
        headers: { 
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );
    
    let isEligible = false;
    if (eligibilityResponse.data.products && eligibilityResponse.data.products.length > 0) {
      const product = eligibilityResponse.data.products[0];
      for (const variant of product.variants) {
        if (variant.gtin === productGtin && variant.zipcode_inventory && variant.zipcode_inventory[customerZip]) {
          const inventory = parseInt(variant.zipcode_inventory[customerZip]);
          if (inventory > 0) {
            isEligible = true;
            console.log(`✅ ELIGIBLE! ${inventory} units available for next-day delivery`);
            console.log(`   Product: ${variant.title}`);
            console.log(`   Price: $${variant.price}`);
            break;
          }
        }
      }
    }
    
    if (!isEligible) {
      console.log(`❌ NOT ELIGIBLE for next-day delivery in ${customerZip}`);
    }
    
  } catch (error) {
    console.log(`❌ Shopify simulation failed: ${error.message}`);
  }
}

testSpecificScenarios().catch(console.error);
