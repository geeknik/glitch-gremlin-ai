import fs from 'fs';
import path from 'path';
import { PublicKey } from '@solana/web3.js';

interface WalletConfig {
  publicKey: string;
  privateKey: number[];
}

export function loadGovernanceWallets() {
  const configPath = path.join(__dirname, '../../config');
  const files = fs.readdirSync(configPath);
  
  return files.filter(f => f.endsWith('ggai.json')).map(file => {
    const fullPath = path.join(configPath, file);
    const data: WalletConfig = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    return {
      publicKey: new PublicKey(data.publicKey),
      privateKey: Uint8Array.from(data.privateKey)
    };
  });
}

export const MULTISIG_WALLET = loadGovernanceWallets()
  .find(w => w.publicKey.toString().endsWith('multisig'))!;
