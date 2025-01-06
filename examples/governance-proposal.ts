import { GlitchSDK, TestType, version as sdkVersion } from '@glitch-gremlin/sdk';
import { Keypair } from '@solana/web3.js';

async function createGovernanceProposal() {
    const keypairData = JSON.parse(
        readFileSync(process.env.SOLANA_KEYPAIR_PATH!, 'utf-8')
    );
    const wallet = Keypair.fromSecretKey(Buffer.from(keypairData));
    
    const sdk = new GlitchSDK({
        cluster: process.env.SOLANA_CLUSTER || 'devnet',
        wallet
    });

    // Create a governance proposal for a community chaos test
    const proposal = await sdk.createProposal({
        title: "Test Popular DEX Protocol",
        description: "Run comprehensive chaos tests on XYZ DEX",
        targetProgram: "DEX_PROGRAM_ID",
        testParams: {
            testType: TestType.EXPLOIT,
            duration: 600,
            intensity: 8,
            params: {
                categories: ["reentrancy", "arithmetic"]
            }
        },
        stakingAmount: 1000 // Amount of GREMLINAI tokens to stake
    });

    console.log(`Created proposal: ${proposal.id}`);
    console.log("View on Explorer:", `https://explorer.solana.com/tx/${proposal.signature}`);
}

createGovernanceProposal().catch(console.error);
