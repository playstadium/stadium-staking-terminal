#!/bin/bash

echo "🏟️  Stadium Staking Terminal - Quick Start"
echo "=========================================="
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

echo "🚀 Starting Stadium Staking Terminal..."
echo ""
echo "📊 API will be available at: http://localhost:3000/api/stats"
echo "🌐 Web interface at: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm start
