# 🤖 Glitch Gremlin AI - The AI Chaos Agent for Solana

$GREMLINAI is more than just another memecoin - it's a revolutionary Chaos-as-a-Service (CaaS) platform that helps developers stress-test their Solana dApps through controlled chaos. Our AI-powered Glitch Gremlin creates unpredictable scenarios and simulates real-world attacks, helping you build more resilient applications.

## Why Choose $GREMLINAI?

The future of dApp security is chaotic - embrace it

### Chaos-as-a-Service
Unleash controlled chaos to expose vulnerabilities, fortify your dApps, and outsmart hackers before they strike.

### AI-Generated Chaos
Using advanced algorithms, Glitch Gremlin crafts chaos tailored to your system, exposing hidden vulnerabilities and edge cases no human test could imagine.

### Community Driven
Shape the future of dApp security by proposing and voting on chaos tests. Collaborate with other engineers, influence what gets tested next, and drive innovation across the Glitch Gremlin ecosystem.

### Lightning Fast
Built on Solana for blazing-fast transactions and minimal fees. Test more, pay less, and stay ahead of potential threats.

### Security First
All chaos is contained in controlled environments. Our open-source systems are publicly audited, and our testing protocols are battle-tested to ensure the highest level of security.

### Earn Rewards
The more chaos you create, the more you earn. Stake $GREMLINAI to fuel the ecosystem and earn rewards from successful chaos tests, protocol fees, and governance participation. Turn your contributions into real value.

- On-chain token mechanics
- AI-driven testing scenarios
- Community governance
- Real-world dApp security probing

## Token Details

- Symbol: $GREMLINAI
- Decimals: 9  
- Chain: Solana  
- Total Supply: 1,000,000,000  
- Contract Address: Bx6XZrN7pjbDA5wkiKagbbyHSr1jai45m8peSSmJpump

## Development Status

🚧 Currently in initial development phase:
- [x] Token Configuration
- [ ] On-chain Program Development
- [ ] AI Engine Implementation
- [ ] Governance Integration

## Getting Started

### Program Deployment

1. Build the program:
```bash
cargo build-bpf
```

2. Deploy to devnet:
```bash
solana program deploy target/deploy/glitch_gremlin.so --url devnet
```

3. Save the Program ID:
```bash
export PROGRAM_ID=<your-program-id>
```

4. Set upgrade authority:
```bash
solana program set-upgrade-authority $PROGRAM_ID \
  --new-upgrade-authority <multisig-address>
```

### Wallet Assignment

Programs don't have wallet addresses - they have Program IDs. However, you can:
1. Create a PDA (Program Derived Address) for your program:
```typescript
const [pda] = await PublicKey.findProgramAddress(
  [Buffer.from("glitch_gremlin")],
  programId
);
```

2. Use this PDA as the program's "wallet" for:
- Receiving tokens
- Managing escrow
- Storing program state

## Security

This project is in active development. Use at your own risk.

## Follow Us

Stay updated with the latest news and announcements:

- [X (Twitter)](https://x.com/glitchgremlinai)
- [GitHub](https://github.com/geeknik/glitch-gremlin-ai)
- [Documentation](https://ggai.gitbook.io/ggai-docs)
