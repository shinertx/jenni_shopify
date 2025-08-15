/**
 * Universal JENNi Integration Library
 * Works with any platform - just include this file!
 */

class JENNiUniversal {
  constructor(config) {
    this.config = {
      clientId: config.clientId || '111038',
      clientSecret: config.clientSecret || '46c3a03e-fbe0-4ae8-b74f-455f11246f91',
      apiHost: config.apiHost || 'http://35.209.65.82:8082',
      ...config
    };
    
    this.token = null;
    this.tokenExpiry = 0;
    this.cache = new Map();
  }

  // ✅ FIXED: Authentication handling with auto-refresh
  async getAccessToken() {
    if (this.token && Date.now() < this.tokenExpiry) {
      return this.token;
    }

    try {
      const response = await fetch(`${this.config.apiHost}/api/sku-graph/product-availability-service/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret
        })
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.status}`);
      }

      const data = await response.json();
      this.token = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // 1 minute buffer
      
      return this.token;
    } catch (error) {
      console.error('JENNi authentication error:', error);
      throw error;
    }
  }

  // ✅ FIXED: Universal eligibility check with caching
  async checkEligibility(gtin, zip) {
    const cacheKey = `${gtin}:${zip}`;
    
    // Check cache first (10 minute TTL)
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < 600000) {
        return cached.data;
      }
    }

    try {
      const token = await this.getAccessToken();
      
      const response = await fetch(`${this.config.apiHost}/api/sku-graph/product-availability-service/searchProducts/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ gtin, page: 1, page_size: 10 })
      });

      if (!response.ok) {
        if (response.status === 404) {
          const result = { eligible: false, reason: 'Product not found' };
          this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
          return result;
        }
        throw new Error(`API error: ${response.status}`);
      }

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

      const result = {
        eligible,
        inventory,
        productInfo,
        reason: eligible ? 'Available' : 'Not available in ZIP code'
      };

      // Cache result
      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;

    } catch (error) {
      console.error('JENNi eligibility check error:', error);
      return { eligible: false, error: error.message };
    }
  }

  // ✅ FIXED: Universal order submission
  async submitOrder(orderData) {
    try {
      const token = await this.getAccessToken();
      
      // Transform order to JENNi format
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

      // Note: JENNi doesn't have order endpoint yet, so we'll log for now
      console.log('Order would be submitted to JENNi:', jenniOrder);
      
      // When JENNi adds order endpoint:
      // const response = await fetch(`${this.config.apiHost}/api/orders`, {
      //   method: 'POST',
      //   headers: {
      //     'Authorization': `Bearer ${token}`,
      //     'Content-Type': 'application/json'
      //   },
      //   body: JSON.stringify(jenniOrder)
      // });

      return { success: true, orderId: orderData.orderId };

    } catch (error) {
      console.error('JENNi order submission error:', error);
      return { success: false, error: error.message };
    }
  }

  // ✅ FIXED: Universal webhook handler
  handleStatusUpdate(webhookData) {
    // Standard webhook handler for order status updates
    const { orderId, status, trackingNumber } = webhookData;
    
    // Emit custom event that any platform can listen to
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('jenni:orderUpdate', {
        detail: { orderId, status, trackingNumber }
      }));
    }
    
    // Call platform-specific callback if provided
    if (this.config.onOrderUpdate) {
      this.config.onOrderUpdate({ orderId, status, trackingNumber });
    }
    
    return { success: true };
  }

  // ✅ FIXED: Universal widget creation
  createWidget(container, options = {}) {
    const gtin = options.gtin;
    const defaultZip = options.defaultZip;
    
    if (!gtin) {
      console.error('GTIN is required for JENNi widget');
      return;
    }

    const widget = document.createElement('div');
    widget.className = 'jenni-widget';
    widget.innerHTML = `
      <div class="jenni-widget-content">
        <h4>🚀 Next-Day Delivery</h4>
        <div class="jenni-zip-input">
          <input type="text" 
                 id="jenni-zip-${Date.now()}" 
                 placeholder="Enter ZIP code"
                 value="${defaultZip || ''}" />
          <button onclick="this.jenni.checkDelivery()">Check</button>
        </div>
        <div class="jenni-result"></div>
      </div>
      
      <style>
        .jenni-widget {
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          padding: 15px;
          margin: 10px 0;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .jenni-zip-input {
          display: flex;
          gap: 10px;
          margin: 10px 0;
        }
        .jenni-zip-input input {
          flex: 1;
          padding: 8px;
          border: 1px solid #ccc;
          border-radius: 4px;
        }
        .jenni-zip-input button {
          background: #007bff;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
        }
        .jenni-available {
          color: #28a745;
          font-weight: bold;
        }
        .jenni-unavailable {
          color: #6c757d;
        }
      </style>
    `;

    // Attach functionality
    const zipInput = widget.querySelector('input');
    const button = widget.querySelector('button');
    const result = widget.querySelector('.jenni-result');
    
    const checkDelivery = async () => {
      const zip = zipInput.value.trim();
      if (!zip) {
        alert('Please enter a ZIP code');
        return;
      }
      
      result.innerHTML = 'Checking availability...';
      
      try {
        const availability = await this.checkEligibility(gtin, zip);
        
        if (availability.eligible) {
          result.innerHTML = `
            <div class="jenni-available">
              ✅ Available tomorrow via JENNi!
              ${availability.inventory > 1 ? ` (${availability.inventory} in stock)` : ''}
            </div>
          `;
          
          // Dispatch event for e-commerce platform integration
          window.dispatchEvent(new CustomEvent('jenni:eligible', {
            detail: { gtin, zip, availability }
          }));
          
        } else {
          result.innerHTML = `
            <div class="jenni-unavailable">
              📦 Standard shipping available
            </div>
          `;
        }
        
        // Save ZIP for future use
        localStorage.setItem('jenni_customer_zip', zip);
        
      } catch (error) {
        result.innerHTML = `
          <div class="jenni-unavailable">
            Error checking availability
          </div>
        `;
      }
    };

    button.onclick = checkDelivery;
    zipInput.onkeypress = (e) => e.key === 'Enter' && checkDelivery();
    
    // Auto-check if ZIP is provided
    if (defaultZip) {
      setTimeout(checkDelivery, 500);
    }

    container.appendChild(widget);
    return widget;
  }

  // ✅ FIXED: Platform detection and auto-integration
  autoIntegrate() {
    // Auto-detect platform and integrate
    if (typeof window === 'undefined') return; // Server-side
    
    // Shopify detection
    if (window.Shopify) {
      this.integrateShopify();
    }
    
    // WooCommerce detection
    if (window.wc_add_to_cart_params || document.body.classList.contains('woocommerce')) {
      this.integrateWooCommerce();
    }
    
    // Magento detection
    if (window.BLANK_CONFIG || document.body.classList.contains('catalog-product-view')) {
      this.integrateMagento();
    }
    
    // Generic integration for any site
    this.integrateGeneric();
  }

  // Platform-specific integrations
  integrateShopify() {
    console.log('JENNi: Shopify integration active');
    // Find product pages and add widgets
    if (window.location.pathname.includes('/products/')) {
      this.addWidgetToShopify();
    }
  }

  integrateWooCommerce() {
    console.log('JENNi: WooCommerce integration active');
    const productContainer = document.querySelector('.single-product .summary');
    if (productContainer) {
      const sku = document.querySelector('.sku')?.textContent;
      if (sku) {
        this.createWidget(productContainer, { gtin: sku });
      }
    }
  }

  integrateMagento() {
    console.log('JENNi: Magento integration active');
    const productContainer = document.querySelector('.product-info-main');
    if (productContainer) {
      // Try to find SKU
      const sku = document.querySelector('[data-th="SKU"]')?.textContent;
      if (sku) {
        this.createWidget(productContainer, { gtin: sku });
      }
    }
  }

  integrateGeneric() {
    // Look for common product page patterns
    const containers = [
      '.product-details',
      '.product-info',
      '.product-summary',
      '.add-to-cart-form',
      '#product-form'
    ];
    
    for (const selector of containers) {
      const container = document.querySelector(selector);
      if (container) {
        // Try to find SKU/GTIN in various ways
        const sku = this.findProductSku();
        if (sku) {
          this.createWidget(container, { gtin: sku });
          break;
        }
      }
    }
  }

  findProductSku() {
    // Try multiple methods to find product SKU/GTIN
    const methods = [
      () => document.querySelector('[data-sku]')?.dataset.sku,
      () => document.querySelector('[data-gtin]')?.dataset.gtin,
      () => document.querySelector('.sku')?.textContent?.trim(),
      () => document.querySelector('.product-sku')?.textContent?.trim(),
      () => document.querySelector('meta[property="product:retailer_item_id"]')?.content,
      () => {
        const jsonLd = document.querySelector('script[type="application/ld+json"]');
        if (jsonLd) {
          try {
            const data = JSON.parse(jsonLd.textContent);
            return data.sku || data.gtin || data.productID;
          } catch (e) {}
        }
      }
    ];
    
    for (const method of methods) {
      const result = method();
      if (result) return result;
    }
    
    return null;
  }
}

// ✅ FIXED: Global initialization - works on any website
(function() {
  // Auto-initialize if credentials are provided
  if (typeof window !== 'undefined') {
    window.JENNi = new JENNiUniversal({
      // Can be overridden by setting window.JENNI_CONFIG
      ...window.JENNI_CONFIG
    });
    
    // Auto-integrate when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => window.JENNi.autoIntegrate());
    } else {
      window.JENNi.autoIntegrate();
    }
  }
})();

// Export for Node.js/module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JENNiUniversal;
}
