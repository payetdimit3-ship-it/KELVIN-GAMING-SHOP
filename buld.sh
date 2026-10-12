#!/bin/bash

echo "🔨 Building LifeisGameTz..."

# Tengeneza folder ya dist
mkdir -p dist
mkdir -p dist/js
mkdir -p dist/admin
mkdir -p dist/css

# Copy files
cp *.html dist/ 2>/dev/null
cp admin/*.html dist/admin/ 2>/dev/null
cp -r js/* dist/js/ 2>/dev/null
cp -r css/* dist/css/ 2>/dev/null

# Badilisha placeholders na env variables
sed -i "s|%%SUPABASE_URL%%|${SUPABASE_URL}|g" dist/js/config.js
sed -i "s|%%SUPABASE_ANON_KEY%%|${SUPABASE_ANON_KEY}|g" dist/js/config.js

# Hakikisha placeholders zimebadilishwa
if grep -q "%%SUPABASE_URL%%" dist/js/config.js; then
  echo "❌ ERROR: SUPABASE_URL haipo!"
  exit 1
fi

if grep -q "%%SUPABASE_ANON_KEY%%" dist/js/config.js; then
  echo "❌ ERROR: SUPABASE_ANON_KEY haipo!"
  exit 1
fi

echo "✅ Build complete!"