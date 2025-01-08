<template>
  <div class="wallet-connection">
    <button 
      v-if="!isConnected"
      @click="connectWallet"
      class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded"
    >
      Connect Wallet
    </button>
    <div v-else class="wallet-info bg-gray-800 p-4 rounded">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p class="text-sm text-gray-400">Connected Wallet:</p>
          <p class="text-lg">{{ shortAddress }}</p>
        </div>
        <div>
          <p class="text-sm text-gray-400">$GREMLINAI Balance:</p>
          <p class="text-lg">{{ gremlinBalance.toLocaleString() }}</p>
        </div>
        <div>
          <p class="text-sm text-gray-400">Voting Power:</p>
          <p class="text-lg">{{ votingPower.toLocaleString() }}</p>
        </div>
        <div>
          <p class="text-sm text-gray-400">Staked Tokens:</p>
          <p class="text-lg">{{ stakedBalance.toLocaleString() }}</p>
        </div>
      </div>
      <div class="mt-4">
        <button 
          @click="disconnectWallet"
          class="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 rounded text-sm"
        >
          Disconnect Wallet
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useWallet } from '@solana/wallet-adapter-vue';
import { GlitchSDK } from '@glitch-gremlin/sdk';

const { connected, publicKey, connect, disconnect } = useWallet();
const gremlinBalance = ref(0);
const votingPower = ref(0);
const stakedBalance = ref(0);
let sdkInstance = null;

const shortAddress = computed(() => {
  if (!publicKey.value) return '';
  const addr = publicKey.value.toString();
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
});

const connectWallet = async () => {
  try {
    await connect();
    await initializeSDK();
    await fetchWalletData();
  } catch (error) {
    console.error('Wallet connection failed:', error);
  }
};

const disconnectWallet = async () => {
  await disconnect();
  if (sdkInstance) {
    await sdkInstance['queueWorker'].close();
  }
};

const initializeSDK = async () => {
  sdkInstance = await GlitchSDK.init({
    cluster: 'https://api.mainnet-beta.solana.com',
    wallet: publicKey.value
  });
};

const fetchWalletData = async () => {
  try {
    // Fetch token balance
    const balance = await sdkInstance.connection.getBalance(publicKey.value);
    gremlinBalance.value = balance / 1e9; // Convert lamports to SOL
    
    // Fetch voting power and staked balance
    const stakeInfo = await sdkInstance.getStakeInfo(publicKey.value.toString());
    if (stakeInfo) {
      votingPower.value = Number(stakeInfo.amount);
      stakedBalance.value = Number(stakeInfo.amount);
    }
  } catch (error) {
    console.error('Failed to fetch wallet data:', error);
  }
};

// Watch for wallet changes
watch(publicKey, async (newKey) => {
  if (newKey) {
    await fetchWalletData();
  }
});
</script>
