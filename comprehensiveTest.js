import "dotenv/config";
import axios from "axios";

const JENNI_CLIENT_ID = process.env.JENNI_CLIENT_ID || "111038";
const JENNI_CLIENT_SECRET = process.env.JENNI_CLIENT_SECRET || "46c3a03e-fbe0-4ae8-b74f-455f11246f91";
const JENNI_API_HOST = process.env.JENNI_API_HOST || "http://35.209.65.82:8082";

async function comprehensiveTest() {
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

  // Test comprehensive scenarios with correct page_size
  const scenarios = [
    {
      name: "All Nike products",
      payload: { brand: "Nike", page: 1, page_size: 10 }
    },
    {
      name: "All Adidas products", 
      payload: { brand: "Adidas", page: 1, page_size: 10 }
    },
    {
      name: "Products in Dallas (75062)",
      payload: { zip: "75062", page: 1, page_size: 10 }
    },
    {
      name: "Products in NYC (10001)",
      payload: { zip: "10001", page: 1, page_size: 10 }
    },
    {
      name: "Specific Nike socks GTIN",
      payload: { gtin: "009328295433", page: 1, page_size: 10 }
    },
    {
      name: "Nike + Dallas combo",
      payload: { brand: "Nike", zip: "75062", page: 1, page_size: 10 }
    },
    {
      name: "GTIN + Dallas combo", 
      payload: { gtin: "009328295433", zip: "75062", page: 1, page_size: 10 }
    }
  ];

  for (const scenario of scenarios) {
    try {
      console.log(`🧪 ${scenario.name}`);
      console.log(`Request:`, JSON.stringify(scenario.payload, null, 2));
      
      const response = await axios.post(
        `${JENNI_API_HOST}/api/sku-graph/product-availability-service/searchProducts/`,
        scenario.payload,
        {
          headers: { 
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          timeout: 15000
        }
      );
      
      console.log(`✅ SUCCESS! Found ${response.data.total_products} total products`);
      console.log(`   Returned ${response.data.products?.length || 0} products in this page`);
      
      if (response.data.products && response.data.products.length > 0) {
        const firstProduct = response.data.products[0];
        console.log(`   First product: ${firstProduct.title} (${firstProduct.brand})`);
        
        if (firstProduct.variants && firstProduct.variants.length > 0) {
          const firstVariant = firstProduct.variants[0];
          console.log(`   GTIN: ${firstVariant.gtin}, Price: $${firstVariant.price}`);
          
          if (firstVariant.zipcode_inventory) {
            const zipCodes = Object.keys(firstVariant.zipcode_inventory);
            console.log(`   Available in ${zipCodes.length} ZIP codes: ${zipCodes.slice(0, 5).join(', ')}${zipCodes.length > 5 ? '...' : ''}`);
          }
        }
      }
      
    } catch (error) {
      console.log(`❌ FAILED! Status: ${error.response?.status}`);
      if (error.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          error.response.data.detail.forEach(err => {
            console.log(`   Error: ${err.msg} (${err.loc?.join('.')})`);
          });
        } else {
          console.log(`   Error: ${error.response.data.detail.message || error.response.data.detail}`);
        }
      }
    }
    console.log('\n' + '='.repeat(60) + '\n');
  }

  // REAL SHOPIFY INTEGRATION TEST
  console.log("🏪 REAL SHOPIFY INTEGRATION SIMULATION");
  console.log("=" * 60);
  
  try {
    console.log("Scenario: Customer in Dallas wants Nike socks");
    console.log("Step 1: Check if specific GTIN is available in Dallas");
    
    const gtin = "009328295433";
    const zip = "75062";
    
    const checkResponse = await axios.post(
      `${JENNI_API_HOST}/api/sku-graph/product-availability-service/searchProducts/`,
      { gtin: gtin, page: 1, page_size: 10 },
      {
        headers: { 
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );
    
    console.log(`   Found ${checkResponse.data.total_products} products with GTIN ${gtin}`);
    
    if (checkResponse.data.products && checkResponse.data.products.length > 0) {
      const product = checkResponse.data.products[0];
      let eligible = false;
      let availableStock = 0;
      
      for (const variant of product.variants) {
        if (variant.gtin === gtin && variant.zipcode_inventory && variant.zipcode_inventory[zip]) {
          availableStock = parseInt(variant.zipcode_inventory[zip]);
          if (availableStock > 0) {
            eligible = true;
            break;
          }
        }
      }
      
      if (eligible) {
        console.log(`✅ ELIGIBLE! ${availableStock} units available for next-day delivery`);
        console.log(`   Product: ${product.title}`);
        console.log(`   Price: $${product.variants[0].price}`);
        console.log(`   >>> Widget would show: "Available tomorrow via JENNi!"`);
      } else {
        console.log(`❌ NOT ELIGIBLE - No inventory in ZIP ${zip}`);
        console.log(`   Product: ${product.title}`);
        console.log(`   Available in other ZIPs: ${Object.keys(product.variants[0].zipcode_inventory).join(', ')}`);
        console.log(`   >>> Widget would show: "Not available for Next‑Day in your area."`);
      }
    } else {
      console.log(`❌ Product with GTIN ${gtin} not found in JENNi catalog`);
    }
    
  } catch (error) {
    console.log(`❌ Integration simulation failed: ${error.message}`);
  }
}

comprehensiveTest().catch(console.error);
