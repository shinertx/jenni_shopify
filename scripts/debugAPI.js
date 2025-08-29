import "dotenv/config";
import axios from "axios";

const JENNI_CLIENT_ID = process.env.JENNI_CLIENT_ID || "111038";
const JENNI_CLIENT_SECRET = process.env.JENNI_CLIENT_SECRET || "46c3a03e-fbe0-4ae8-b74f-455f11246f91";
const JENNI_API_HOST = process.env.JENNI_API_HOST || "http://35.209.65.82:8082";

async function debugProductSearch() {
  // Get token first
  const authResponse = await axios.post(
    `${JENNI_API_HOST}/api/sku-graph/product-availability-service/auth/token`,
    {
      client_id: JENNI_CLIENT_ID,
      client_secret: JENNI_CLIENT_SECRET
    }
  );
  
  const accessToken = authResponse.data.access_token;
  console.log("✅ Got access token");

  // Test different product search payloads
  const testCases = [
    {
      name: "Empty payload",
      payload: {}
    },
    {
      name: "Only pagination",
      payload: { page: 1, page_size: 10 }
    },
    {
      name: "With ZIP",
      payload: { zip: "10001", page: 1, page_size: 10 }
    },
    {
      name: "With specific GTIN",
      payload: { gtin: "123456789012", page: 1, page_size: 10 }
    },
    {
      name: "With brand",
      payload: { brand: "Nike", page: 1, page_size: 10 }
    }
  ];

  for (const testCase of testCases) {
    try {
      console.log(`\n🧪 Testing: ${testCase.name}`);
      console.log(`Payload:`, JSON.stringify(testCase.payload, null, 2));
      
      const response = await axios.post(
        `${JENNI_API_HOST}/api/sku-graph/product-availability-service/searchProducts/`,
        testCase.payload,
        {
          headers: { 
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          timeout: 10000
        }
      );
      
      console.log(`✅ Success! Status: ${response.status}`);
      console.log(`Response:`, JSON.stringify(response.data, null, 2));
      
    } catch (error) {
      console.log(`❌ Failed! Status: ${error.response?.status}`);
      console.log(`Error details:`, JSON.stringify(error.response?.data, null, 2));
    }
  }
}

debugProductSearch().catch(console.error);
// (Relocated to scripts/)
