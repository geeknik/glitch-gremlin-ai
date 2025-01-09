#!/bin/bash

# Create directories if they don't exist
mkdir -p program-keys config

# Generate program IDs with custom suffixes
echo "Generating program IDs with custom suffixes..."
echo "This may take a few minutes..."

# Generate main program IDs (ends with ggaig1tch)
MAIN_PROGRAMS=()
for i in {1..3}; do
    MAIN_PROGRAMS+=("$(solana-keygen grind --ends-with ggaig1tch:1 --num-threads 4)")
done
echo "Main program IDs:"
printf '%s\n' "${MAIN_PROGRAMS[@]}"

# Generate governance program IDs (ends with ggaig0v)
GOVERNANCE_PROGRAMS=()
for i in {1..3}; do
    GOVERNANCE_PROGRAMS+=("$(solana-keygen grind --ends-with ggaig0v:1 --num-threads 4)")
done
echo "Governance program IDs:"
printf '%s\n' "${GOVERNANCE_PROGRAMS[@]}"

# Generate token program IDs (ends with ggait0k3n)
TOKEN_PROGRAMS=()
for i in {1..3}; do
    TOKEN_PROGRAMS+=("$(solana-keygen grind --ends-with ggait0k3n:1 --num-threads 4)")
done
echo "Token program IDs:"
printf '%s\n' "${TOKEN_PROGRAMS[@]}"

# Generate worker program IDs (ends with ggaiw0rk3r)
WORKER_PROGRAMS=()
for i in {1..3}; do
    WORKER_PROGRAMS+=("$(solana-keygen grind --ends-with ggaiw0rk3r:1 --num-threads 4)")
done
echo "Worker program IDs:"
printf '%s\n' "${WORKER_PROGRAMS[@]}"

# Create program IDs config with alternates
echo "{
    \"glitch_gremlin\": {
        \"primary\": \"${MAIN_PROGRAMS[0]}\",
        \"alternates\": [\"${MAIN_PROGRAMS[1]}\", \"${MAIN_PROGRAMS[2]}\"]
    },
    \"governance\": {
        \"primary\": \"${GOVERNANCE_PROGRAMS[0]}\",
        \"alternates\": [\"${GOVERNANCE_PROGRAMS[1]}\", \"${GOVERNANCE_PROGRAMS[2]}\"]
    },
    \"token\": {
        \"primary\": \"${TOKEN_PROGRAMS[0]}\",
        \"alternates\": [\"${TOKEN_PROGRAMS[1]}\", \"${TOKEN_PROGRAMS[2]}\"]
    },
    \"worker\": {
        \"primary\": \"${WORKER_PROGRAMS[0]}\",
        \"alternates\": [\"${WORKER_PROGRAMS[1]}\", \"${WORKER_PROGRAMS[2]}\"]
    }
}" > config/program_ids.json

echo "Program IDs setup complete!"
echo "Saved primary and alternate IDs to config/program_ids.json"
