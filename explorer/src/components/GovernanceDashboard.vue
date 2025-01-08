<template>
  <div class="governance-dashboard">
    <h2 class="text-2xl font-semibold mb-4">Governance Dashboard</h2>
    
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <!-- Staking Overview -->
      <div class="bg-gray-800 p-4 rounded">
        <h3 class="text-lg font-semibold mb-2">Staking</h3>
        <p>Staked: {{ stakedAmount }} $GREMLINAI</p>
        <p>Rewards: {{ stakingRewards }} $GREMLINAI</p>
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
        <p>Current: {{ votingPower }}</p>
        <p>Lockup Duration: {{ lockupDuration }} days</p>
      </div>

      <!-- Recent Activity -->
      <div class="bg-gray-800 p-4 rounded">
        <h3 class="text-lg font-semibold mb-2">Recent Activity</h3>
        <ul>
          <li v-for="activity in recentActivity" :key="activity.id">
            {{ activity.description }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script>
import { ref } from 'vue';

export default {
  setup() {
    const stakedAmount = ref(0);
    const stakingRewards = ref(0);
    const votingPower = ref(0);
    const lockupDuration = ref(0);
    const recentActivity = ref([]);

    const openStakingModal = () => {
      // Implement staking modal logic
    };

    return {
      stakedAmount,
      stakingRewards,
      votingPower,
      lockupDuration,
      recentActivity,
      openStakingModal
    };
  }
};
</script>
