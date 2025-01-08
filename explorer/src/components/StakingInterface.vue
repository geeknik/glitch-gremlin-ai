<template>
  <div class="staking-interface">
    <h2 class="text-2xl font-semibold mb-4">Staking & Governance</h2>
    
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Stake Tokens -->
      <div class="bg-gray-800 p-4 rounded">
        <h3 class="text-lg font-semibold mb-2">Stake Tokens</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">Amount to Stake</label>
            <input
              v-model="stakeAmount"
              type="number"
              min="1000"
              placeholder="Minimum 1000 $GREMLINAI"
              class="w-full p-2 rounded bg-gray-700 text-white"
            />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">Lockup Duration</label>
            <select
              v-model="lockupDuration"
              class="w-full p-2 rounded bg-gray-700 text-white"
            >
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="180">180 days</option>
              <option value="365">1 year</option>
            </select>
          </div>
          
          <div class="text-sm text-gray-400">
            <p>Estimated Rewards: {{ estimatedRewards.toLocaleString() }} $GREMLINAI</p>
            <p>Voting Power Multiplier: {{ votingMultiplier }}x</p>
          </div>
          
          <button 
            @click="stakeTokens"
            class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            :disabled="!isConnected || stakeAmount < 1000"
          >
            Stake Tokens
          </button>
        </div>
      </div>

      <!-- Unstake Tokens -->
      <div class="bg-gray-800 p-4 rounded">
        <h3 class="text-lg font-semibold mb-2">Your Stakes</h3>
        <div v-if="activeStakes.length > 0" class="space-y-2">
          <div 
            v-for="stake in activeStakes" 
            :key="stake.id"
            class="p-2 bg-gray-700 rounded"
          >
            <div class="flex justify-between text-sm">
              <span>{{ stake.amount.toLocaleString() }} $GREMLINAI</span>
              <span>{{ formatTimeRemaining(stake.unlockTime) }}</span>
            </div>
            <button 
              v-if="stake.canUnstake"
              @click="unstakeTokens(stake.id)"
              class="w-full mt-2 bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 rounded text-sm"
            >
              Unstake
            </button>
          </div>
        </div>
        <div v-else class="text-gray-400 text-sm">
          No active stakes
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useWallet } from '@solana/wallet-adapter-vue';
import { GlitchSDK } from '@glitch-gremlin/sdk';

const { connected, publicKey } = useWallet();
const stakeAmount = ref(0);
const lockupDuration = ref(30);
const activeStakes = ref([]);
let sdkInstance = null;

const isConnected = computed(() => connected.value && publicKey.value);

const estimatedRewards = computed(() => {
  const amount = stakeAmount.value || 0;
  const duration = lockupDuration.value || 0;
  return Math.floor(amount * (duration / 365) * 0.05); // 5% APY
});

const votingMultiplier = computed(() => {
  const duration = lockupDuration.value || 0;
  return Math.min(1 + (duration / 365) * 2, 3); // Up to 3x multiplier
});

const fetchStakes = async () => {
  try {
    if (!sdkInstance) {
      sdkInstance = await GlitchSDK.init({
        cluster: 'https://api.mainnet-beta.solana.com',
        wallet: publicKey.value
      });
    }
    
    const stakes = await sdkInstance.getStakes(publicKey.value.toString());
    activeStakes.value = stakes.map(s => ({
      ...s,
      canUnstake: s.unlockTime <= Date.now()
    }));
  } catch (error) {
    console.error('Failed to fetch stakes:', error);
  }
};

const stakeTokens = async () => {
  try {
    await sdkInstance.stakeTokens(
      stakeAmount.value,
      lockupDuration.value * 24 * 60 * 60 // Convert days to seconds
    );
    await fetchStakes();
  } catch (error) {
    console.error('Staking failed:', error);
  }
};

const unstakeTokens = async (stakeId) => {
  try {
    await sdkInstance.unstakeTokens(stakeId);
    await fetchStakes();
  } catch (error) {
    console.error('Unstaking failed:', error);
  }
};

const formatTimeRemaining = (timestamp) => {
  const now = Date.now();
  const diff = timestamp - now;
  
  if (diff <= 0) return 'Ready to unstake';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  return `${days} days remaining`;
};

// Fetch stakes when wallet connects
watch(isConnected, async (newVal) => {
  if (newVal) {
    await fetchStakes();
  }
});
</script>
