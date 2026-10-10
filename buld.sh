#!/bin/bash

echo "🔨 Building LifeisGameTz..."

# Tengeneza folder ya dist
mkdir -p dist

# Copy files
cp index.html dist/index.html
cp config.js dist/config.js

# Badilisha placeholders na env variables
sed -i "s|%%SUPABASE_URL%%|${SUPABASE_URL}|g" dist/config.js
sed -i "s|%%SUPABASE_ANON_KEY%%|${SUPABASE_ANON_KEY}|g" dist/config.js

# Hakikisha placeholders zimebadilishwa
if grep -q "%%SUPABASE_URL%%" dist/config.js; then
  echo "❌ ERROR: SUPABASE_URL haipo!"
  exit 1
fi

if grep -q "%%SUPABASE_ANON_KEY%%" dist/config.js; then
  echo "❌ ERROR: SUPABASE_ANON_KEY haipo!"
  exit 1
fi

echo "✅ Build complete!"