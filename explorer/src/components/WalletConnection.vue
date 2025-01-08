<template>
  <div class="wallet-connection">
    <button 
      v-if="!isConnected"
      @click="connectWallet"
      class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded"
    >
      Connect Wallet
    </button>
    <div v-else class="wallet-info">
      <p>Connected: {{ walletAddress }}</p>
      <p>Balance: {{ gremlinBalance }} $GREMLINAI</p>
      <p>Voting Power: {{ votingPower }}</p>
    </div>
  </div>
</template>

<script>
import { ref } from 'vue';
import { useWallet } from '@solana/wallet-adapter-vue';

export default {
  setup() {
    const { connected, publicKey, connect } = useWallet();
    const gremlinBalance = ref(0);
    const votingPower = ref(0);

    const connectWallet = async () => {
      try {
        await connect();
        // Fetch wallet balance and voting power
        fetchWalletData();
      } catch (error) {
        console.error('Wallet connection failed:', error);
      }
    };

    const fetchWalletData = async () => {
      // Implement API calls to fetch balance and voting power
    };

    return {
      isConnected: connected,
      walletAddress: publicKey,
      gremlinBalance,
      votingPower,
      connectWallet
    };
  }
};
</script>
