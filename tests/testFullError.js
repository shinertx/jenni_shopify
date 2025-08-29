import "dotenv/config";
import axios from "axios";

const JENNI_CLIENT_ID = process.env.JENNI_CLIENT_ID || "111038";
const JENNI_CLIENT_SECRET = process.env.JENNI_CLIENT_SECRET || "46c3a03e-fbe0-4ae8-b74f-455f11246f91";
const JENNI_API_HOST = process.env.JENNI_API_HOST || "http://35.209.65.82:8082";

async function testWithFullErrorDetails() {
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

  try {
    console.log("🧪 Testing brand filter that worked before...");
    const response = await axios.post(
      `${JENNI_API_HOST}/api/sku-graph/product-availability-service/searchProducts/`,
      { brand: "Nike", page: 1, page_size: 3 },
      {
        headers: { 
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );
    
    console.log("✅ Success!");
    console.log("Response:", JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.log("❌ Failed with full error details:");
    console.log("Status:", error.response?.status);
    console.log("Status text:", error.response?.statusText);
    console.log("Headers:", error.response?.headers);
    console.log("Data:", JSON.stringify(error.response?.data, null, 2));
    console.log("Message:", error.message);
    
    if (error.code) {
      console.log("Code:", error.code);
    }
  }
}

testWithFullErrorDetails().catch(console.error);
// (Relocated to tests/)
