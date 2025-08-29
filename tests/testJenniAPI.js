import "dotenv/config";
import axios from "axios";

// JENNi API credentials from .env
const JENNI_CLIENT_ID = process.env.JENNI_CLIENT_ID || "111038";
const JENNI_CLIENT_SECRET = process.env.JENNI_CLIENT_SECRET || "46c3a03e-fbe0-4ae8-b74f-455f11246f91";
const JENNI_API_HOST = process.env.JENNI_API_HOST || "http://35.209.65.82:8082";

console.log("🚀 Starting JENNi API Tests...\n");
console.log(`API Host: ${JENNI_API_HOST}`);
console.log(`Client ID: ${JENNI_CLIENT_ID}`);
console.log(`Client Secret: ${JENNI_CLIENT_SECRET.substring(0, 8)}...\n`);

async function testJenniAPI() {
  let accessToken = null;
  
  try {
    // TEST 1: Authentication
    console.log("🔐 TEST 1: Authentication");
    console.log("Attempting to get access token...");
    
    const authResponse = await axios.post(
      `${JENNI_API_HOST}/api/sku-graph/product-availability-service/auth/token`,
      {
        client_id: JENNI_CLIENT_ID,
        client_secret: JENNI_CLIENT_SECRET
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 10000
      }
    );
    
    accessToken = authResponse.data.access_token;
    console.log("✅ Authentication successful!");
    console.log(`Token type: ${authResponse.data.token_type}`);
    console.log(`Expires in: ${authResponse.data.expires_in} seconds`);
    console.log(`Token preview: ${accessToken.substring(0, 20)}...\n`);
    
  } catch (error) {
    console.log("❌ Authentication failed!");
    console.log(`Status: ${error.response?.status}`);
    console.log(`Error: ${error.response?.data || error.message}`);
    return;
  }

  try {
    // TEST 2: Health Check
    console.log("🏥 TEST 2: Health Check");
    const healthResponse = await axios.get(
      `${JENNI_API_HOST}/api/sku-graph/product-availability-service/health`,
      { timeout: 10000 }
    );
    console.log(`✅ Health check passed! Status: ${healthResponse.status}\n`);
    
  } catch (error) {
    console.log("❌ Health check failed!");
    console.log(`Error: ${error.response?.data || error.message}\n`);
  }

  try {
    // TEST 3: Product Search (All Products)
    console.log("🔍 TEST 3: Product Search - All Products");
    const searchResponse = await axios.post(
      `${JENNI_API_HOST}/api/sku-graph/product-availability-service/searchProducts/`,
      {
        page: 1,
        page_size: 5
      },
      {
        headers: { 
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );
    
    console.log("✅ Product search successful!");
    console.log(`Total products: ${searchResponse.data.total_products}`);
    console.log(`Total pages: ${searchResponse.data.total_pages}`);
    console.log(`Products returned: ${searchResponse.data.products?.length || 0}`);
    
    if (searchResponse.data.products && searchResponse.data.products.length > 0) {
      const product = searchResponse.data.products[0];
      console.log("\n📦 First Product Details:");
      console.log(`Title: ${product.title}`);
      console.log(`Brand: ${product.brand}`);
      console.log(`Category: ${product.category}`);
      console.log(`Variants: ${product.variants?.length || 0}`);
      
      if (product.variants && product.variants.length > 0) {
        const variant = product.variants[0];
        console.log(`\n🏷️  First Variant:`);
        console.log(`GTIN: ${variant.gtin}`);
        console.log(`Price: $${variant.price}`);
        console.log(`Stock: ${variant.stock_status}`);
        console.log(`ZIP Inventory:`, variant.zipcode_inventory);
      }
    }
    console.log();
    
  } catch (error) {
    console.log("❌ Product search failed!");
    console.log(`Status: ${error.response?.status}`);
    console.log(`Error: ${error.response?.data || error.message}\n`);
  }

  try {
    // TEST 4: ZIP Code Specific Search
    console.log("📍 TEST 4: ZIP Code Specific Search (NYC - 10001)");
    const zipSearchResponse = await axios.post(
      `${JENNI_API_HOST}/api/sku-graph/product-availability-service/searchProducts/`,
      {
        zip: "10001",
        page: 1,
        page_size: 3
      },
      {
        headers: { 
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );
    
    console.log("✅ ZIP search successful!");
    console.log(`Products available in 10001: ${zipSearchResponse.data.total_products}`);
    
    if (zipSearchResponse.data.products && zipSearchResponse.data.products.length > 0) {
      zipSearchResponse.data.products.forEach((product, index) => {
        console.log(`\n${index + 1}. ${product.title} (${product.brand})`);
        product.variants?.forEach((variant, vIndex) => {
          const inventory = variant.zipcode_inventory?.['10001'];
          if (inventory) {
            console.log(`   Variant ${vIndex + 1}: GTIN ${variant.gtin} - ${inventory} in stock`);
          }
        });
      });
    }
    console.log();
    
  } catch (error) {
    console.log("❌ ZIP search failed!");
    console.log(`Status: ${error.response?.status}`);
    console.log(`Error: ${error.response?.data || error.message}\n`);
  }

  try {
    // TEST 5: Brand Filter
    console.log("🏢 TEST 5: Brand Search");
    const brandResponse = await axios.post(
      `${JENNI_API_HOST}/api/sku-graph/product-availability-service/searchProducts/`,
      {
        brand: "Nike",
        page: 1,
        page_size: 2
      },
      {
        headers: { 
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );
    
    console.log("✅ Brand search successful!");
    console.log(`Nike products found: ${brandResponse.data.total_products}`);
    console.log();
    
  } catch (error) {
    console.log("❌ Brand search failed!");
    console.log(`Status: ${error.response?.status}`);
    console.log(`Error: ${error.response?.data || error.message}\n`);
  }

  try {
    // TEST 6: Category Filter
    console.log("📂 TEST 6: Category Filter");
    const categoryResponse = await axios.get(
      `${JENNI_API_HOST}/api/sku-graph/product-availability-service/getList/`,
      {
        params: { type: "category" },
        headers: { "Authorization": `Bearer ${accessToken}` },
        timeout: 10000
      }
    );
    
    console.log("✅ Category list retrieved!");
    console.log("Available categories:", categoryResponse.data);
    console.log();
    
  } catch (error) {
    console.log("❌ Category retrieval failed!");
    console.log(`Status: ${error.response?.status}`);
    console.log(`Error: ${error.response?.data || error.message}\n`);
  }

  console.log("🎉 JENNi API Testing Complete!");
}

// Run the tests
testJenniAPI().catch(console.error);
// (Relocated to tests/)
