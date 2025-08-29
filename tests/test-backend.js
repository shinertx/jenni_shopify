/**
 * Test the Universal JENNi Backend API
 */

import express from 'express';
import axios from 'axios';
import { JENNiBackend, createJENNiAPI } from '../jenni-backend.js';

async function testBackendAPI() {
  console.log('🚀 Testing Universal JENNi Backend API...\n');

  // Test 1: Create JENNi backend instance
  console.log('📦 TEST 1: Creating JENNi Backend Instance');
  try {
    const jenni = new JENNiBackend({
      clientId: '111038',
      clientSecret: '46c3a03e-fbe0-4ae8-b74f-455f11246f91',
      apiHost: 'http://35.209.65.82:8082'
    });
    console.log('✅ Backend instance created successfully');
  } catch (error) {
    console.log('❌ Failed to create backend instance:', error.message);
    return;
  }

  // Test 2: Authentication
  console.log('\n🔐 TEST 2: Authentication');
  const jenni = new JENNiBackend();
  try {
    const token = await jenni.getAccessToken();
    console.log('✅ Authentication successful');
    console.log(`   Token preview: ${token.substring(0, 20)}...`);
  } catch (error) {
    console.log('❌ Authentication failed:', error.message);
    return;
  }

  // Test 3: Eligibility Check
  console.log('\n🔍 TEST 3: Eligibility Check');
  try {
    const result = await jenni.checkEligibility('009328295433', '75062');
    console.log('✅ Eligibility check successful');
    console.log(`   Eligible: ${result.eligible}`);
    console.log(`   Inventory: ${result.inventory}`);
    if (result.productInfo) {
      console.log(`   Product: ${result.productInfo.title}`);
      console.log(`   Price: $${result.productInfo.price}`);
    }
  } catch (error) {
    console.log('❌ Eligibility check failed:', error.message);
  }

  // Test 4: Order Submission
  console.log('\n📦 TEST 4: Order Submission');
  try {
    const orderData = {
      storeId: 'test-store',
      orderId: 'TEST-001',
      shippingAddress: {
        line1: '123 Main St',
        city: 'Dallas',
        state: 'TX',
        zip: '75062'
      },
      items: [
        {
          gtin: '009328295433',
          quantity: 1,
          price: 20
        }
      ]
    };

    const result = await jenni.submitOrder(orderData);
    console.log('✅ Order submission successful');
    console.log(`   Success: ${result.success}`);
    console.log(`   Order ID: ${result.orderId}`);
  } catch (error) {
    console.log('❌ Order submission failed:', error.message);
  }

  // Test 5: Express Middleware
  console.log('\n🌐 TEST 5: Express Middleware');
  try {
    const app = express();
    app.use(express.json());
    
    // Add JENNi API middleware
    app.use('/api/jenni', createJENNiAPI());
    
    const server = app.listen(3001, () => {
      console.log('✅ Express server with JENNi API started on port 3001');
      
      // Test the endpoints
      setTimeout(async () => {
        await testAPIEndpoints();
        server.close();
      }, 1000);
    });
    
  } catch (error) {
    console.log('❌ Express middleware setup failed:', error.message);
  }
}

async function testAPIEndpoints() {
  console.log('\n🔌 Testing API Endpoints:');
  
  const baseURL = 'http://localhost:3001/api/jenni';
  
  // Test health endpoint
  try {
    const response = await axios.get(`${baseURL}/health`);
    console.log('✅ Health endpoint working');
    console.log(`   Status: ${response.data.status}`);
  } catch (error) {
    console.log('❌ Health endpoint failed');
  }
  
  // Test eligibility endpoint
  try {
    const response = await axios.post(`${baseURL}/eligibility`, {
      gtin: '009328295433',
      zip: '75062'
    });
    console.log('✅ Eligibility endpoint working');
    console.log(`   Eligible: ${response.data.eligible}`);
  } catch (error) {
    console.log('❌ Eligibility endpoint failed:', error.message);
  }
  
  // Test order endpoint
  try {
    const response = await axios.post(`${baseURL}/order`, {
      storeId: 'test-store',
      orderId: 'API-TEST-001',
      shippingAddress: {
        line1: '123 Test St',
        city: 'Dallas',
        state: 'TX',
        zip: '75062'
      },
      items: [
        {
          gtin: '009328295433',
          quantity: 1,
          price: 20
        }
      ]
    });
    console.log('✅ Order endpoint working');
    console.log(`   Success: ${response.data.success}`);
  } catch (error) {
    console.log('❌ Order endpoint failed:', error.message);
  }
  
  console.log('\n🎉 Backend API testing complete!');
}

// Run the tests
testBackendAPI().catch(console.error);
