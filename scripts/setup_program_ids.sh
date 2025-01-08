#!/bin/bash

# Create directories if they don't exist
mkdir -p program-keys config

# Generate program IDs with custom prefix
echo "Generating program IDs with glitch:1 prefix..."
echo "This may take a few minutes..."

# Generate main program ID (starts with ggai, ends with g1tch)
MAIN_PROGRAM=$(solana-keygen grind --starts-with ggai:1 --ends-with g1tch:1 --num-threads 4)
echo "Main program ID: $MAIN_PROGRAM"

# Generate governance program ID (starts with ggai, ends with g0v)
GOVERNANCE_PROGRAM=$(solana-keygen grind --starts-with ggai:1 --ends-with g0v:1 --num-threads 4)
echo "Governance program ID: $GOVERNANCE_PROGRAM"

# Generate token program ID (starts with ggai, ends with t0k3n)
TOKEN_PROGRAM=$(solana-keygen grind --starts-with ggai:1 --ends-with t0k3n:1 --num-threads 4)
echo "Token program ID: $TOKEN_PROGRAM"

# Generate worker program ID (starts with ggai, ends with w0rk3r)
WORKER_PROGRAM=$(solana-keygen grind --starts-with ggai:1 --ends-with w0rk3r:1 --num-threads 4)
echo "Worker program ID: $WORKER_PROGRAM"

# Create program IDs config
echo "{
    \"glitch_gremlin\": \"$MAIN_PROGRAM\",
    \"governance\": \"$GOVERNANCE_PROGRAM\",
    \"token\": \"$TOKEN_PROGRAM\",
    \"worker\": \"$WORKER_PROGRAM\"
}" > config/program_ids.json

echo "Program IDs setup complete!"
echo "Saved to config/program_ids.json"
