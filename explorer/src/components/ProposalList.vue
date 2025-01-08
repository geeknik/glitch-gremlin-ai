<template>
  <div class="proposal-list">
    <h2 class="text-2xl font-semibold mb-4">Active Proposals</h2>
    
    <div class="grid grid-cols-1 gap-4">
      <div 
        v-for="proposal in proposals" 
        :key="proposal.id"
        class="bg-gray-800 p-4 rounded"
      >
        <h3 class="text-lg font-semibold">{{ proposal.title }}</h3>
        <p class="text-gray-400 text-sm mb-2">{{ proposal.description }}</p>
        
        <div class="progress-bar bg-gray-700 h-2 rounded-full mb-2">
          <div 
            class="bg-green-500 h-full rounded-full"
            :style="{ width: `${proposal.progress}%` }"
          ></div>
        </div>
        
        <div class="flex justify-between text-sm">
          <span>Yes: {{ proposal.votesYes }}</span>
          <span>No: {{ proposal.votesNo }}</span>
        </div>
        
        <div class="mt-4 flex space-x-2">
          <button 
            @click="vote(proposal.id, true)"
            class="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-2 rounded"
          >
            Vote Yes
          </button>
          <button 
            @click="vote(proposal.id, false)"
            class="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 rounded"
          >
            Vote No
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref } from 'vue';

export default {
  setup() {
    const proposals = ref([
      // Example data
      {
        id: 1,
        title: "Upgrade Chaos Engine",
        description: "Proposal to upgrade the AI chaos engine",
        votesYes: 1200,
        votesNo: 800,
        progress: 60
      }
    ]);

    const vote = async (proposalId, vote) => {
      // Implement voting logic
    };

    return {
      proposals,
      vote
    };
  }
};
</script>
