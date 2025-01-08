#!/bin/bash

# Create directories if they don't exist
mkdir -p program-keys config

# Generate new program ID
solana-keygen new --force -o program-keys/glitch_gremlin.json

# Extract public key
PUBKEY=$(solana-keygen pubkey program-keys/glitch_gremlin.json)

# Create program IDs config
echo "{
    \"glitch_gremlin\": \"$PUBKEY\"
}" > config/program_ids.json

echo "Program IDs setup complete!"
echo "glitch_gremlin program ID: $PUBKEY"
