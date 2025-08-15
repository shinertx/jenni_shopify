#!/bin/bash

# JENNi Test Store Server
# A simple HTTP server for testing the complete JENNi integration

echo "🏪 Starting JENNi Test Store Server..."
echo ""
echo "📍 Store URL: http://localhost:8080"
echo "🎯 Test ZIP codes:"
echo "   • 75062 (Dallas) - Should have inventory"
echo "   • 75225 (Dallas) - Should have inventory"  
echo "   • 10001 (NYC) - Should be unavailable"
echo ""
echo "🛍️ Real JENNi Products Available:"
echo "   • Nike Dri-FIT Socks (Size 5-7) - GTIN: 009328295433"
echo "   • Nike Dri-FIT Socks (Size 8-12) - GTIN: 009328295440"
echo "   • Nike Sportswear T-Shirt - GTIN: 009328580522"
echo "   • Nike Air Max Sneakers - GTIN: 194955549315"
echo "   • Nike Training Shorts - GTIN: 195237738533"
echo "   • Nike Therma-FIT Hoodie - GTIN: 195866908796"
echo ""
echo "🔍 What to Test:"
echo "   1. Enter a Dallas ZIP code (75062)"
echo "   2. Watch real-time availability checking"
echo "   3. Add available items to cart"
echo "   4. Complete checkout with JENNi"
echo "   5. Try NYC ZIP (10001) to see unavailable state"
echo ""
echo "Press Ctrl+C to stop the server"
echo "=================================================="

# Check if Python is available
if command -v python3 &> /dev/null; then
    python3 -m http.server 8080
elif command -v python &> /dev/null; then
    python -m http.server 8080
else
    echo "❌ Python not found. Please install Python to run the test server."
    echo "Or open index.html directly in your browser."
    exit 1
fi
