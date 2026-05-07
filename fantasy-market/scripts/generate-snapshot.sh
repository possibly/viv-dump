#!/bin/bash
# Generate a fantasy-market world snapshot for viv-space visualization

set -e

SCALE="${FM_SCALE:-phase-b}"
DAYS="${FM_DAYS:-30}"
SEED="${FM_SEED:-1}"

echo "Generating snapshot: scale=$SCALE days=$DAYS seed=$SEED"
FM_SCALE="$SCALE" FM_DAYS="$DAYS" FM_SEED="$SEED" npm start

SNAPSHOT=$(ls -t public/chronicle-seed${SEED}-scale${SCALE}* 2>/dev/null | head -1)

if [ -z "$SNAPSHOT" ]; then
    echo "Error: snapshot not found"
    exit 1
fi

echo ""
echo "✓ Snapshot created: $SNAPSHOT"
echo ""
echo "To visualize in viv-space:"
echo "  1. Clone: git clone https://github.com/possibly/viv-space.git"
echo "  2. Copy:  cp $(pwd)/$SNAPSHOT viv-space/public/sample-chronicle.json"
echo "  3. Run:   cd viv-space && npm run dev"
echo "  4. Open:  http://localhost:5173"
