import "dotenv/config";
import axios from "axios";

const JENNI_CLIENT_ID = "111038";
const JENNI_CLIENT_SECRET = "46c3a03e-fbe0-4ae8-b74f-455f11246f91";
const JENNI_API_HOST = "http://35.209.65.82:8082";

async function testJenniAPI() {
  try {
    // Test authentication
    console.log("Testing JENNi API authentication...");
    const authResponse = await axios.post(
      `${JENNI_API_HOST}/api/sku-graph/product-availability-service/auth/token`,
      {
        client_id: JENNI_CLIENT_ID,
        client_secret: JENNI_CLIENT_SECRET
      }
    );
    
    console.log("Authentication successful!");
    console.log("Token expires in:", authResponse.data.expires_in, "seconds");
    
    const token = authResponse.data.access_token;
    
    // Test health check
    console.log("\nTesting health endpoint...");
    const healthResponse = await axios.get(
      `${JENNI_API_HOST}/api/sku-graph/product-availability-service/health`
    );
    console.log("Health check:", healthResponse.status === 200 ? "OK" : "Failed");
    
    // Test product search
    console.log("\nTesting product search...");
    const searchResponse = await axios.post(
      `${JENNI_API_HOST}/api/sku-graph/product-availability-service/searchProducts/`,
      {
        zip: "10001", // NYC zip code
        page: 1,
        page_size: 5
      },
      {
        headers: { 
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );
    
    console.log("Search response:");
    console.log("Total products found:", searchResponse.data.total_products);
    console.log("Total pages:", searchResponse.data.total_pages);
    
    if (searchResponse.data.products && searchResponse.data.products.length > 0) {
      const firstProduct = searchResponse.data.products[0];
      console.log("\nFirst product:");
      console.log("Title:", firstProduct.title);
      console.log("Brand:", firstProduct.brand);
      console.log("Category:", firstProduct.category);
      console.log("Variants:", firstProduct.variants.length);
      
      if (firstProduct.variants.length > 0) {
        const firstVariant = firstProduct.variants[0];
        console.log("\nFirst variant:");
        console.log("GTIN:", firstVariant.gtin);
        console.log("Price:", firstVariant.price);
        console.log("Stock status:", firstVariant.stock_status);
        console.log("ZIP inventory:", firstVariant.zipcode_inventory);
      }
    }
    
  } catch (error: any) {
    console.error("Error testing JENNi API:", error.response?.data || error.message);
  }
}

testJenniAPI();
