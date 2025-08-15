import "dotenv/config";
import axios from "axios";

const JENNI_CLIENT_ID = process.env.JENNI_CLIENT_ID || "111038";
const JENNI_CLIENT_SECRET = process.env.JENNI_CLIENT_SECRET || "46c3a03e-fbe0-4ae8-b74f-455f11246f91";
const JENNI_API_HOST = process.env.JENNI_API_HOST || "http://35.209.65.82:8082";

async function testSingleFilters() {
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

  // Test single filters only
  const tests = [
    {
      name: "Nike products (brand only)",
      payload: { brand: "Nike", page: 1, page_size: 3 }
    },
    {
      name: "Adidas products (brand only)", 
      payload: { brand: "Adidas", page: 1, page_size: 3 }
    },
    {
      name: "ZIP code 75062 only",
      payload: { zip: "75062", page: 1, page_size: 3 }
    },
    {
      name: "ZIP code 10001 only",
      payload: { zip: "10001", page: 1, page_size: 3 }
    },
    {
      name: "Specific GTIN only",
      payload: { gtin: "009328295433", page: 1, page_size: 3 }
    }
  ];

  for (const test of tests) {
    try {
      console.log(`🧪 Testing: ${test.name}`);
      console.log(`Payload:`, JSON.stringify(test.payload, null, 2));
      
      const response = await axios.post(
        `${JENNI_API_HOST}/api/sku-graph/product-availability-service/searchProducts/`,
        test.payload,
        {
          headers: { 
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          timeout: 15000
        }
      );
      
      console.log(`✅ Success! Found ${response.data.total_products} products`);
      
      if (response.data.products && response.data.products.length > 0) {
        response.data.products.forEach((product, index) => {
          console.log(`   ${index + 1}. ${product.title} (${product.brand})`);
          
          if (product.variants && product.variants.length > 0) {
            product.variants.forEach((variant, vIndex) => {
              console.log(`      Variant ${vIndex + 1}: GTIN ${variant.gtin}, Price $${variant.price}`);
              if (variant.zipcode_inventory && Object.keys(variant.zipcode_inventory).length > 0) {
                console.log(`      Available in ZIPs:`, Object.keys(variant.zipcode_inventory).join(', '));
              }
            });
          }
        });
      }
      
    } catch (error) {
      console.log(`❌ Failed! Status: ${error.response?.status}`);
      if (error.response?.data?.detail) {
        console.log(`   Error: ${error.response.data.detail.message}`);
      } else {
        console.log(`   Raw error:`, error.response?.data);
      }
    }
    console.log('\n' + '='.repeat(50) + '\n');
  }
}

testSingleFilters().catch(console.error);
