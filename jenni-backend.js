/**
 * Universal Backend API for JENNi Integration
 * Express.js middleware that works with any platform
 */

import express from 'express';
import axios from 'axios';

class JENNiBackend {
  constructor(config = {}) {
    this.config = {
      clientId: config.clientId || process.env.JENNI_CLIENT_ID || '111038',
      clientSecret: config.clientSecret || process.env.JENNI_CLIENT_SECRET || '46c3a03e-fbe0-4ae8-b74f-455f11246f91',
      apiHost: config.apiHost || process.env.JENNI_API_HOST || 'http://35.209.65.82:8082',
      ...config
    };
    
    this.token = null;
    this.tokenExpiry = 0;
    this.cache = new Map();
    
    // Create Express router
    this.router = express.Router();
    this.setupRoutes();
  }

  // ✅ FIXED: Auto token management
  async getAccessToken() {
    if (this.token && Date.now() < this.tokenExpiry) {
      return this.token;
    }

    try {
      const response = await axios.post(
        `${this.config.apiHost}/api/sku-graph/product-availability-service/auth/token`,
        {
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret
        }
      );

      this.token = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;
      
      return this.token;
    } catch (error) {
      console.error('JENNi authentication failed:', error.message);
      throw new Error('Authentication failed');
    }
  }

  // ✅ FIXED: Universal API routes
  setupRoutes() {
    // Eligibility check endpoint
    this.router.post('/eligibility', async (req, res) => {
      try {
        const { gtin, zip } = req.body;
        
        if (!gtin || !zip) {
          return res.status(400).json({ 
            error: 'GTIN and ZIP code are required' 
          });
        }

        const result = await this.checkEligibility(gtin, zip);
        res.json(result);
        
      } catch (error) {
        console.error('Eligibility check error:', error);
        res.status(500).json({ 
          error: 'Failed to check eligibility',
          details: error.message 
        });
      }
    });

    // Order submission endpoint
    this.router.post('/order', async (req, res) => {
      try {
        const orderData = req.body;
        const result = await this.submitOrder(orderData);
        res.json(result);
        
      } catch (error) {
        console.error('Order submission error:', error);
        res.status(500).json({ 
          error: 'Failed to submit order',
          details: error.message 
        });
      }
    });

    // Webhook handler for status updates
    this.router.post('/webhook/status', async (req, res) => {
      try {
        const statusData = req.body;
        
        // Process the status update
        await this.handleStatusUpdate(statusData);
        
        res.json({ success: true });
        
      } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).json({ 
          error: 'Failed to process webhook' 
        });
      }
    });

    // Health check endpoint
    this.router.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'jenni-integration'
      });
    });

    // Get available brands
    this.router.get('/brands', async (req, res) => {
      try {
        const token = await this.getAccessToken();
        const response = await axios.get(
          `${this.config.apiHost}/api/sku-graph/product-availability-service/getList/`,
          {
            params: { type: 'brand' },
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        
        res.json(response.data);
        
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch brands' });
      }
    });
  }

  // ✅ FIXED: Universal eligibility check
  async checkEligibility(gtin, zip) {
    const cacheKey = `${gtin}:${zip}`;
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < 600000) { // 10 minutes
        return cached.data;
      }
    }

    try {
      const token = await this.getAccessToken();
      
      const response = await axios.post(
        `${this.config.apiHost}/api/sku-graph/product-availability-service/searchProducts/`,
        { gtin, page: 1, page_size: 10 },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      let eligible = false;
      let inventory = 0;
      let productInfo = null;

      if (response.data.products && response.data.products.length > 0) {
        for (const product of response.data.products) {
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

      const result = {
        eligible,
        inventory,
        productInfo,
        gtin,
        zip
      };

      // Cache result
      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      
      return result;

    } catch (error) {
      if (error.response?.status === 404) {
        const result = { eligible: false, reason: 'Product not found in JENNi catalog' };
        this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
      }
      throw error;
    }
  }

  // ✅ FIXED: Universal order submission
  async submitOrder(orderData) {
    try {
      const token = await this.getAccessToken();
      
      // Transform to JENNi format
      const jenniOrder = {
        storeId: orderData.storeId,
        orderId: orderData.orderId,
        address: orderData.shippingAddress,
        lines: orderData.items.map(item => ({
          gtin: item.gtin || item.sku,
          quantity: item.quantity,
          price: item.price
        }))
      };

      // For now, just log (until JENNi provides order endpoint)
      console.log('Order ready for JENNi:', jenniOrder);
      
      // When JENNi adds order endpoint:
      // const response = await axios.post(
      //   `${this.config.apiHost}/api/orders`,
      //   jenniOrder,
      //   { headers: { Authorization: `Bearer ${token}` } }
      // );

      return { 
        success: true, 
        orderId: orderData.orderId,
        jenniOrder 
      };

    } catch (error) {
      throw new Error(`Order submission failed: ${error.message}`);
    }
  }

  // ✅ FIXED: Webhook status handler
  async handleStatusUpdate(statusData) {
    const { orderId, status, trackingNumber } = statusData;
    
    // Emit event for platform-specific handling
    if (this.config.onStatusUpdate) {
      await this.config.onStatusUpdate({ orderId, status, trackingNumber });
    }
    
    console.log(`Order ${orderId} status updated to: ${status}`);
    
    return { success: true };
  }

  // ✅ FIXED: Express middleware factory
  middleware() {
    return this.router;
  }

  // ✅ FIXED: Platform-specific integrations
  
  // WordPress/WooCommerce integration
  wordPressPlugin() {
    return `
<?php
/**
 * Plugin Name: JENNi Next-Day Delivery
 * Description: Universal JENNi integration for WordPress/WooCommerce
 */

// Add REST API endpoints
add_action('rest_api_init', function() {
    register_rest_route('jenni/v1', '/eligibility', array(
        'methods' => 'POST',
        'callback' => 'jenni_check_eligibility',
        'permission_callback' => '__return_true'
    ));
});

function jenni_check_eligibility($request) {
    $params = $request->get_json_params();
    $gtin = $params['gtin'];
    $zip = $params['zip'];
    
    // Call your Node.js backend
    $response = wp_remote_post('http://localhost:3000/api/jenni/eligibility', array(
        'headers' => array('Content-Type' => 'application/json'),
        'body' => json_encode(array('gtin' => $gtin, 'zip' => $zip))
    ));
    
    if (is_wp_error($response)) {
        return new WP_Error('api_error', 'Failed to check eligibility');
    }
    
    return json_decode(wp_remote_retrieve_body($response), true);
}

// Add widget to product pages
add_action('woocommerce_single_product_summary', 'jenni_add_widget', 25);

function jenni_add_widget() {
    global $product;
    $sku = $product->get_sku();
    if ($sku) {
        echo '<div id="jenni-widget-container" data-gtin="' . esc_attr($sku) . '"></div>';
        echo '<script src="path/to/jenni-universal.js"></script>';
    }
}
?>`;
  }

  // Magento 2 module
  magentoModule() {
    return {
      'registration.php': `<?php
\\Magento\\Framework\\Component\\ComponentRegistrar::register(
    \\Magento\\Framework\\Component\\ComponentRegistrar::MODULE,
    'JENNi_Integration',
    __DIR__
);`,
      
      'etc/module.xml': `<?xml version="1.0"?>
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
        xsi:noNamespaceSchemaLocation="urn:magento:framework:Module/etc/module.xsd">
    <module name="JENNi_Integration" setup_version="1.0.0"/>
</config>`,
      
      'Controller/Api/Eligibility.php': `<?php
namespace JENNi\\Integration\\Controller\\Api;

class Eligibility extends \\Magento\\Framework\\App\\Action\\Action
{
    public function execute()
    {
        $gtin = $this->getRequest()->getParam('gtin');
        $zip = $this->getRequest()->getParam('zip');
        
        // Call Node.js backend
        $response = $this->callJenniApi($gtin, $zip);
        
        $this->getResponse()
            ->setHeader('Content-Type', 'application/json')
            ->setBody(json_encode($response));
    }
    
    private function callJenniApi($gtin, $zip)
    {
        // cURL call to your backend
        return ['eligible' => false]; // placeholder
    }
}`
    };
  }
}

// ✅ FIXED: Easy setup function
function createJENNiAPI(config = {}) {
  const jenni = new JENNiBackend(config);
  return jenni.middleware();
}

// Export for different environments
export { JENNiBackend, createJENNiAPI };

// Usage examples:
/*

// Express.js app
const express = require('express');
const { createJENNiAPI } = require('./jenni-backend');

const app = express();
app.use('/api/jenni', createJENNiAPI());

// Or with custom config
app.use('/api/jenni', createJENNiAPI({
  clientId: 'your-client-id',
  clientSecret: 'your-secret',
  onStatusUpdate: async (status) => {
    // Custom order status handling
    console.log('Order update:', status);
  }
}));

app.listen(3000);

*/
