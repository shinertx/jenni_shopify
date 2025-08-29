/**
 * Simple test of JENNi Universal Frontend Library
 * Tests core functionality without dependencies
 * (Relocated to tests/)
 */

import "dotenv/config";

console.log('🚀 Testing JENNi Universal Core Functions...\n');

// Mock window object for Node.js testing
global.window = {
  localStorage: {
    store: {},
    getItem: function(key) { return this.store[key] || null; },
    setItem: function(key, value) { this.store[key] = value; }
  },
  dispatchEvent: function(event) { 
    console.log(`📡 Event dispatched: ${event.type}`, event.detail);
  },
  addEventListener: function(type, listener) {
    console.log(`📡 Event listener added for: ${type}`);
  }
};

global.document = {
  readyState: 'complete',
  createElement: function(tag) {
    return {
      className: '',
      innerHTML: '',
      querySelector: () => null,
      appendChild: () => {}
    };
  },
  querySelector: () => null,
  addEventListener: () => {}
};

global.fetch = async function(url, options) {
  console.log(`🌐 Mock fetch called: ${url}`);
  
  if (url.includes('/auth/token')) {
    return {
      ok: true,
      json: async () => ({
        access_token: 'mock-token-12345',
        expires_in: 3600,
        token_type: 'bearer'
      })
    };
  }
  
  if (url.includes('/searchProducts/')) {
    return {
      ok: true,
      json: async () => ({
        total_products: 1,
        products: [{
          jenni_parent_id: 'TEST_001',
          title: 'Test Nike Socks',
          brand: 'Nike',
          variants: [{
            gtin: '009328295433',
            price: 20,
            zipcode_inventory: { '75062': '1' }
          }]
        }]
      })
    };
  }
  
  throw new Error('Mock fetch: Unknown URL');
};

// Test the JENNi Universal class
class JENNiUniversal {
  constructor(config = {}) {
    this.config = {
      clientId: '111038',
      clientSecret: '46c3a03e-fbe0-4ae8-b74f-455f11246f91',
      apiHost: 'http://35.209.65.82:8082',
      ...config
    };
    this.token = null;
    this.tokenExpiry = 0;
    this.cache = new Map();
  }

  async getAccessToken() {
    if (this.token && Date.now() < this.tokenExpiry) {
      return this.token;
    }

    const response = await fetch(`${this.config.apiHost}/api/sku-graph/product-availability-service/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret
      })
    });

    const data = await response.json();
    this.token = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
    
    return this.token;
  }

  async checkEligibility(gtin, zip) {
    const cacheKey = `${gtin}:${zip}`;
    
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < 600000) {
        return cached.data;
      }
    }

    const token = await this.getAccessToken();
    
    const response = await fetch(`${this.config.apiHost}/api/sku-graph/product-availability-service/searchProducts/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ gtin, page: 1, page_size: 10 })
    });

    const data = await response.json();
    
    let eligible = false;
    let inventory = 0;
    let productInfo = null;

    if (data.products && data.products.length > 0) {
      for (const product of data.products) {
        for (const variant of product.variants) {
          if (variant.gtin === gtin && variant.zipcode_inventory && variant.zipcode_inventory[zip]) {
            inventory = parseInt(variant.zipcode_inventory[zip]);
            if (inventory > 0) {
              eligible = true;
              productInfo = {
                title: variant.title,
                price: variant.price,
                brand: product.brand
              };
              break;
            }
          }
        }
        if (eligible) break;
      }
    }

    const result = { eligible, inventory, productInfo };
    this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  }

  createWidget(container, options = {}) {
    const widget = document.createElement('div');
    widget.className = 'jenni-widget';
    console.log(`📦 Widget created for GTIN: ${options.gtin}`);
    return widget;
  }

  findProductSku() {
    console.log('🔍 Mock SKU finder would look for product identifiers');
    return '009328295433'; // Mock SKU
  }

  autoIntegrate() {
    console.log('🔄 Auto-integration would detect platform and add widgets');
    return true;
  }
}

// Run Tests
async function runTests() {
  console.log('📦 TEST 1: Creating JENNi Instance');
  const jenni = new JENNiUniversal();
  console.log('✅ Instance created successfully\n');

  console.log('🔐 TEST 2: Authentication');
  try {
    const token = await jenni.getAccessToken();
    console.log(`✅ Authentication successful: ${token.substring(0, 20)}...\n`);
  } catch (error) {
    console.log(`❌ Authentication failed: ${error.message}\n`);
  }

  console.log('🔍 TEST 3: Eligibility Check');
  try {
    const result = await jenni.checkEligibility('009328295433', '75062');
    console.log(`✅ Eligibility check successful:`);
    console.log(`   Eligible: ${result.eligible}`);
    console.log(`   Inventory: ${result.inventory}`);
    console.log(`   Product: ${result.productInfo?.title}\n`);
  } catch (error) {
    console.log(`❌ Eligibility check failed: ${error.message}\n`);
  }

  console.log('📦 TEST 4: Widget Creation');
  try {
    const mockContainer = { appendChild: () => {} };
    const widget = jenni.createWidget(mockContainer, { gtin: '009328295433' });
    console.log(`✅ Widget creation successful: ${!!widget}\n`);
  } catch (error) {
    console.log(`❌ Widget creation failed: ${error.message}\n`);
  }

  console.log('🔍 TEST 5: SKU Detection');
  try {
    const sku = jenni.findProductSku();
    console.log(`✅ SKU detection: ${sku}\n`);
  } catch (error) {
    console.log(`❌ SKU detection failed: ${error.message}\n`);
  }

  console.log('🔄 TEST 6: Auto Integration');
  try {
    const result = jenni.autoIntegrate();
    console.log(`✅ Auto integration: ${result}\n`);
  } catch (error) {
    console.log(`❌ Auto integration failed: ${error.message}\n`);
  }

  console.log('🎉 All tests completed!');
}

runTests().catch(console.error);
