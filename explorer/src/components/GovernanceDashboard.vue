<template>
  <div class="governance-dashboard">
    <h2 class="text-2xl font-semibold mb-4">Governance Dashboard</h2>
    
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <!-- Staking Overview -->
      <div class="bg-gray-800 p-4 rounded">
        <h3 class="text-lg font-semibold mb-2">Staking</h3>
        <div class="space-y-2">
          <p>Staked: {{ stakedAmount.toLocaleString() }} $GREMLINAI</p>
          <p>Rewards: {{ stakingRewards.toLocaleString() }} $GREMLINAI</p>
          <p>APY: {{ stakingAPY }}%</p>
        </div>
        <button 
          @click="openStakingModal"
          class="mt-2 bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-2 rounded"
        >
          Manage Staking
        </button>
      </div>

      <!-- Voting Power -->
      <div class="bg-gray-800 p-4 rounded">
        <h3 class="text-lg font-semibold mb-2">Voting Power</h3>
        <div class="space-y-2">
          <p>Current: {{ votingPower.toLocaleString() }}</p>
          <p>Lockup Duration: {{ lockupDuration }} days</p>
          <p>Multiplier: {{ votingMultiplier }}x</p>
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="bg-gray-800 p-4 rounded">
        <h3 class="text-lg font-semibold mb-2">Recent Activity</h3>
        <ul class="space-y-1">
          <li v-for="activity in recentActivity" :key="activity.id" class="text-sm">
            <span class="text-gray-400">{{ formatTime(activity.timestamp) }}:</span>
            <span>{{ activity.description }}</span>
          </li>
        </ul>
      </div>
    </div>

    <!-- Chaos Request Form -->
    <div class="bg-gray-800 p-6 rounded mb-8">
      <h3 class="text-xl font-semibold mb-4">Create Chaos Request</h3>
      <form @submit.prevent="createChaosRequest">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">Target Program</label>
            <input
              v-model="chaosRequest.targetProgram"
              type="text"
              required
              class="w-full p-2 rounded bg-gray-700 text-white"
              placeholder="Enter program address"
            />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">Test Type</label>
            <select
              v-model="chaosRequest.testType"
              required
              class="w-full p-2 rounded bg-gray-700 text-white"
            >
              <option value="FUZZ">Fuzz Test</option>
              <option value="LOAD">Load Test</option>
              <option value="EXPLOIT">Exploit Test</option>
              <option value="CONCURRENCY">Concurrency Test</option>
            </select>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">Duration (seconds)</label>
            <input
              v-model="chaosRequest.duration"
              type="number"
              min="60"
              max="3600"
              required
              class="w-full p-2 rounded bg-gray-700 text-white"
              placeholder="60-3600"
            />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">Intensity (1-10)</label>
            <input
              v-model="chaosRequest.intensity"
              type="number"
              min="1"
              max="10"
              required
              class="w-full p-2 rounded bg-gray-700 text-white"
              placeholder="1-10"
            />
          </div>
        </div>
        
        <button
          type="submit"
          class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded"
          :disabled="!isConnected"
        >
          Create Request
        </button>
      </form>
    </div>

    <!-- Real-time Metrics -->
    <div class="bg-gray-800 p-6 rounded">
      <h3 class="text-xl font-semibold mb-4">Network Metrics</h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-gray-700 p-4 rounded">
          <p class="text-sm text-gray-400">Total Requests</p>
          <p class="text-2xl">{{ metrics.totalRequests.toLocaleString() }}</p>
        </div>
        <div class="bg-gray-700 p-4 rounded">
          <p class="text-sm text-gray-400">Active Requests</p>
          <p class="text-2xl">{{ metrics.activeRequests.toLocaleString() }}</p>
        </div>
        <div class="bg-gray-700 p-4 rounded">
          <p class="text-sm text-gray-400">Error Rate</p>
          <p class="text-2xl">{{ metrics.errorRate.toFixed(2) }}%</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useWallet } from '@solana/wallet-adapter-vue';
import { GlitchSDK } from '@glitch-gremlin/sdk';

const { connected, publicKey } = useWallet();
const stakedAmount = ref(0);
const stakingRewards = ref(0);
const votingPower = ref(0);
const lockupDuration = ref(0);
const recentActivity = ref([]);
const metrics = ref({
  totalRequests: 0,
  activeRequests: 0,
  errorRate: 0
});
const chaosRequest = ref({
  targetProgram: '',
  testType: 'FUZZ',
  duration: 300,
  intensity: 5
});
let sdkInstance = null;

const isConnected = computed(() => connected.value && publicKey.value);
const stakingAPY = computed(() => (stakingRewards.value / stakedAmount.value * 100).toFixed(2));
const votingMultiplier = computed(() => Math.min(1 + (lockupDuration.value / 365) * 2, 3));

const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleTimeString();
};

const openStakingModal = () => {
  // Implement staking modal logic
};

const createChaosRequest = async () => {
  try {
    if (!sdkInstance) {
      sdkInstance = await GlitchSDK.init({
        cluster: 'https://api.mainnet-beta.solana.com',
        wallet: publicKey.value
      });
    }
    
    await sdkInstance.createChaosRequest(chaosRequest.value);
    await fetchMetrics();
    recentActivity.value.unshift({
      id: Date.now(),
      timestamp: Date.now(),
      description: `Created ${chaosRequest.value.testType} request`
    });
  } catch (error) {
    console.error('Failed to create chaos request:', error);
  }
};

const fetchMetrics = async () => {
  try {
    if (!sdkInstance) return;
    
    const metricsData = await sdkInstance.getMetrics();
    metrics.value = {
      totalRequests: metricsData.totalRequests,
      activeRequests: metricsData.activeRequests,
      errorRate: metricsData.errorRate
    };
  } catch (error) {
    console.error('Failed to fetch metrics:', error);
  }
};

const fetchStakingInfo = async () => {
  try {
    if (!sdkInstance || !publicKey.value) return;
    
    const stakeInfo = await sdkInstance.getStakeInfo(publicKey.value.toString());
    if (stakeInfo) {
      stakedAmount.value = Number(stakeInfo.amount);
      stakingRewards.value = Number(stakeInfo.rewards);
      votingPower.value = Number(stakeInfo.votingPower);
      lockupDuration.value = Number(stakeInfo.lockupDuration);
    }
  } catch (error) {
    console.error('Failed to fetch staking info:', error);
  }
};

// Initialize on mount
onMounted(async () => {
  if (isConnected.value) {
    sdkInstance = await GlitchSDK.init({
      cluster: 'https://api.mainnet-beta.solana.com',
      wallet: publicKey.value
    });
    await fetchStakingInfo();
    await fetchMetrics();
    
    // Set up periodic refresh
    setInterval(async () => {
      await fetchStakingInfo();
      await fetchMetrics();
    }, 10000);
  }
});
</script>
