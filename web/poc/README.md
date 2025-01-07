# Glitch Gremlin AI Proof of Concept

## Overview
This is a simple web-based interface to demonstrate the core functionality of the Glitch Gremlin AI system. It allows users to:
- Submit chaos requests
- Select test types
- Specify duration and intensity
- View request status

## Setup
1. Install dependencies:
```bash
npm install @gremlinai/sdk
```

2. Build the SDK:
```bash
npm build
```

3. Open the POC in your browser:
```bash
open web/poc/index.html
```

## Demo Flow
1. Enter a valid Solana program address
2. Select a test type (Fuzz, Load, Exploit)
3. Set duration and intensity
4. Submit the request
5. View the status updates

## Notes
- This uses the devnet cluster for testing
- A new wallet is generated for each session
- Results are logged to the console
