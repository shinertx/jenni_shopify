# JENNi API Integration for Any E-commerce Platform

## 🌐 Universal Integration Examples

The JENNi API can integrate with **any e-commerce platform** that can make HTTP requests. Here are examples:

### 1. **WooCommerce (WordPress)**
```php
<?php
// WooCommerce Product Page Hook
add_action('woocommerce_single_product_summary', 'jenni_availability_widget', 25);

function jenni_availability_widget() {
    global $product;
    $gtin = $product->get_sku(); // Or custom GTIN field
    ?>
    <div id="jenni-widget" 
         data-gtin="<?php echo $gtin; ?>" 
         data-product-price="<?php echo $product->get_price(); ?>">
        <div id="jenni-availability">Checking availability...</div>
    </div>
    
    <script>
    document.addEventListener('DOMContentLoaded', function() {
        const zip = localStorage.getItem('customer_zip') || prompt('Enter ZIP for delivery:');
        const gtin = document.getElementById('jenni-widget').dataset.gtin;
        
        fetch('/wp-json/jenni/v1/eligibility', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gtin, zip })
        })
        .then(response => response.json())
        .then(data => {
            const widget = document.getElementById('jenni-availability');
            if (data.eligible) {
                widget.innerHTML = '✅ Available tomorrow via JENNi!';
                widget.style.color = 'green';
            } else {
                widget.innerHTML = '❌ Not available for next-day in your area';
                widget.style.color = 'red';
            }
        });
    });
    </script>
    <?php
}
?>
```

### 2. **Magento 2**
```php
<?php
// app/code/JENNi/Integration/Block/Product/Availability.php
namespace JENNi\Integration\Block\Product;

class Availability extends \Magento\Framework\View\Element\Template
{
    public function getProductGtin()
    {
        $product = $this->getProduct();
        return $product->getData('gtin') ?: $product->getSku();
    }
    
    public function getJenniApiUrl()
    {
        return $this->getUrl('jenni/api/eligibility');
    }
}
?>

<!-- Template: jenni_availability.phtml -->
<div id="jenni-widget" 
     data-gtin="<?= $block->getProductGtin() ?>"
     data-api-url="<?= $block->getJenniApiUrl() ?>">
    <div class="jenni-availability">
        <input type="text" id="zip-input" placeholder="Enter ZIP code" />
        <button onclick="checkJenniAvailability()">Check Next-Day Delivery</button>
        <div id="jenni-result"></div>
    </div>
</div>

<script>
function checkJenniAvailability() {
    const zip = document.getElementById('zip-input').value;
    const gtin = document.getElementById('jenni-widget').dataset.gtin;
    const apiUrl = document.getElementById('jenni-widget').dataset.apiUrl;
    
    fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gtin, zip })
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('jenni-result').innerHTML = 
            data.eligible ? 
            '<span style="color: green;">✅ Available tomorrow!</span>' :
            '<span style="color: red;">❌ Not available in your area</span>';
    });
}
</script>
```

### 3. **BigCommerce**
```javascript
// BigCommerce Stencil Theme
// templates/components/products/jenni-widget.html

{{#if product.sku}}
<div class="jenni-availability-widget" 
     data-gtin="{{product.sku}}"
     data-price="{{product.price.value}}">
    
    <div class="jenni-zip-checker">
        <input type="text" id="jenni-zip" placeholder="Enter ZIP for delivery" />
        <button onclick="checkJenniDelivery()">Check Availability</button>
    </div>
    
    <div id="jenni-result" class="jenni-result"></div>
</div>

<script>
function checkJenniDelivery() {
    const zip = document.getElementById('jenni-zip').value;
    const gtin = document.querySelector('.jenni-availability-widget').dataset.gtin;
    
    fetch('/api/storefront/jenni/eligibility', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            'X-Xsrf-Token': BCData.csrf_token
        },
        body: JSON.stringify({ gtin, zip })
    })
    .then(response => response.json())
    .then(data => {
        const result = document.getElementById('jenni-result');
        result.innerHTML = data.eligible ? 
            '<div class="alert alert-success">🚀 Available tomorrow via JENNi!</div>' :
            '<div class="alert alert-info">Not available for next-day delivery</div>';
    });
}
</script>
{{/if}}
```

### 4. **Custom React/Next.js Store**
```javascript
// components/JenniAvailabilityWidget.js
import { useState, useEffect } from 'react';

export default function JenniAvailabilityWidget({ gtin, productPrice }) {
  const [zip, setZip] = useState('');
  const [availability, setAvailability] = useState(null);
  const [loading, setLoading] = useState(false);

  const checkAvailability = async () => {
    if (!zip || !gtin) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/jenni/eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gtin, zip })
      });
      
      const data = await response.json();
      setAvailability(data);
    } catch (error) {
      console.error('JENNi availability check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="jenni-widget">
      <div className="zip-checker">
        <input
          type="text"
          placeholder="Enter ZIP for next-day delivery"
          value={zip}
          onChange={(e) => setZip(e.target.value)}
          onBlur={checkAvailability}
        />
      </div>
      
      {loading && <div>Checking availability...</div>}
      
      {availability && (
        <div className={`availability-result ${availability.eligible ? 'available' : 'unavailable'}`}>
          {availability.eligible ? (
            <span>🚀 Available tomorrow via JENNi!</span>
          ) : (
            <span>Not available for next-day delivery in your area</span>
          )}
        </div>
      )}
      
      <style jsx>{`
        .jenni-widget {
          border: 1px solid #ddd;
          padding: 15px;
          margin: 10px 0;
          border-radius: 5px;
        }
        .available { color: #28a745; }
        .unavailable { color: #6c757d; }
      `}</style>
    </div>
  );
}

// pages/api/jenni/eligibility.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { gtin, zip } = req.body;
  
  try {
    // Get JENNi token
    const tokenResponse = await fetch(`${process.env.JENNI_API_HOST}/api/sku-graph/product-availability-service/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.JENNI_CLIENT_ID,
        client_secret: process.env.JENNI_CLIENT_SECRET
      })
    });
    
    const { access_token } = await tokenResponse.json();
    
    // Check availability
    const availabilityResponse = await fetch(`${process.env.JENNI_API_HOST}/api/sku-graph/product-availability-service/searchProducts/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ gtin, page: 1, page_size: 10 })
    });
    
    const data = await availabilityResponse.json();
    
    let eligible = false;
    if (data.products && data.products.length > 0) {
      for (const product of data.products) {
        for (const variant of product.variants) {
          if (variant.gtin === gtin && variant.zipcode_inventory && variant.zipcode_inventory[zip]) {
            const inventory = parseInt(variant.zipcode_inventory[zip]);
            if (inventory > 0) {
              eligible = true;
              break;
            }
          }
        }
        if (eligible) break;
      }
    }
    
    res.json({ eligible });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to check availability' });
  }
}
```

### 5. **Pure HTML/JavaScript (Any Website)**
```html
<!DOCTYPE html>
<html>
<head>
    <title>Product with JENNi Delivery</title>
</head>
<body>
    <div class="product">
        <h1>Nike Air Max Sneakers</h1>
        <p>Price: $120</p>
        <p>SKU: 009328295433</p>
        
        <!-- JENNi Widget -->
        <div id="jenni-delivery-widget">
            <h3>🚀 Next-Day Delivery Check</h3>
            <input type="text" id="customer-zip" placeholder="Enter your ZIP code" />
            <button onclick="checkJenniDelivery('009328295433')">Check Availability</button>
            <div id="jenni-result"></div>
        </div>
    </div>

    <script>
    async function checkJenniDelivery(gtin) {
        const zip = document.getElementById('customer-zip').value;
        const resultDiv = document.getElementById('jenni-result');
        
        if (!zip) {
            alert('Please enter your ZIP code');
            return;
        }
        
        resultDiv.innerHTML = 'Checking availability...';
        
        try {
            // This would call your backend API
            const response = await fetch('/api/jenni-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gtin, zip })
            });
            
            const data = await response.json();
            
            if (data.eligible) {
                resultDiv.innerHTML = '<div style="color: green; font-weight: bold;">✅ Available tomorrow via JENNi!</div>';
                
                // Add express shipping option to cart
                document.getElementById('shipping-options').innerHTML += 
                    '<label><input type="radio" name="shipping" value="jenni-express"> JENNi Next-Day Delivery (+$15)</label>';
            } else {
                resultDiv.innerHTML = '<div style="color: orange;">📦 Standard shipping available</div>';
            }
            
        } catch (error) {
            resultDiv.innerHTML = '<div style="color: red;">Error checking availability</div>';
        }
    }
    </script>
</body>
</html>
```

## 🔑 Key Points for Any Platform:

### **Same Core Logic:**
1. **Product Matching**: Use GTIN/SKU from your product catalog
2. **Real-time Check**: Call JENNi API with GTIN + customer ZIP
3. **Display Results**: Show availability to customer
4. **Order Integration**: Forward eligible orders to JENNi

### **Platform-Agnostic Benefits:**
- **Works with any product catalog** that has GTINs/SKUs
- **No platform lock-in** - pure HTTP API calls
- **Flexible UI** - customize widget to match your design
- **Same backend logic** regardless of frontend

### **Universal Implementation:**
```javascript
// Core function that works anywhere
async function checkJenniEligibility(gtin, zip) {
    const response = await fetch('/your-api/jenni/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gtin, zip })
    });
    
    const data = await response.json();
    return data.eligible;
}
```

So yes, the **exact same JENNi integration** works for:
- WooCommerce stores
- Magento stores  
- BigCommerce stores
- Custom React/Vue/Angular apps
- Plain HTML websites
- Mobile apps
- Any platform that can make HTTP requests!

The beauty is that **JENNi provides the universal delivery network**, and you just need to connect your product GTINs to their inventory system. 🚀
