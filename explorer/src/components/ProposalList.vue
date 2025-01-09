<template>
  <div class="proposal-list">
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-2xl font-semibold">Governance Proposals</h2>
      <button 
        @click="openCreateProposalModal"
        class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
      >
        Create Proposal
      </button>
    </div>
    
    <div class="grid grid-cols-1 gap-4">
      <div 
        v-for="proposal in proposals" 
        :key="proposal.id"
        class="bg-gray-800 p-4 rounded"
      >
        <div class="flex justify-between items-start">
          <div>
            <h3 class="text-lg font-semibold">{{ proposal.title }}</h3>
            <p class="text-gray-400 text-sm mb-2">{{ proposal.description }}</p>
          </div>
          <span 
            class="text-sm px-2 py-1 rounded"
            :class="{
              'bg-green-500/20 text-green-400': proposal.status === 'active',
              'bg-blue-500/20 text-blue-400': proposal.status === 'pending',
              'bg-gray-500/20 text-gray-400': proposal.status === 'executed'
            }"
          >
            {{ proposal.status }}
          </span>
        </div>
        
        <div class="mt-4">
          <div class="flex justify-between text-sm mb-2">
            <span>Voting Period:</span>
            <span>{{ formatTimeRemaining(proposal.endTime) }} remaining</span>
          </div>
          
          <div class="progress-bar bg-gray-700 h-2 rounded-full mb-2">
            <div 
              class="bg-green-500 h-full rounded-full"
              :style="{ width: `${proposal.progress}%` }"
            ></div>
          </div>
          
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p class="text-gray-400">Yes Votes:</p>
              <p>{{ proposal.votesYes.toLocaleString() }}</p>
            </div>
            <div>
              <p class="text-gray-400">No Votes:</p>
              <p>{{ proposal.votesNo.toLocaleString() }}</p>
            </div>
          </div>
          
          <div class="mt-4 grid grid-cols-2 gap-2">
            <button 
              @click="vote(proposal.id, true)"
              class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
              :disabled="!isConnected || proposal.status !== 'active'"
            >
              Vote Yes
            </button>
            <button 
              @click="vote(proposal.id, false)"
              class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
              :disabled="!isConnected || proposal.status !== 'active'"
            >
              Vote No
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useWallet } from '@solana/wallet-adapter-vue';
import { GovernanceService } from '../services/governance';

const { connected, publicKey } = useWallet();
const proposals = ref([]);
let sdkInstance = null;

const isConnected = computed(() => connected.value && publicKey.value);

const governanceService = new GovernanceService(window.connection);

const fetchProposals = async () => {
  try {
    proposals.value = await governanceService.getActiveProposals();
  } catch (error) {
    console.error('Failed to fetch proposals:', error);
  }
};

// Refresh proposals every 30 seconds
onMounted(() => {
  fetchProposals();
  setInterval(fetchProposals, 30000);
});

const vote = async (proposalId, support) => {
  try {
    await governanceService.vote(proposalId, support);
    await fetchProposals();
  } catch (error) {
    console.error('Voting failed:', error);
    alert('Failed to submit vote. Please try again.');
  }
};

const openCreateProposalModal = () => {
  // Implement modal logic
};

const formatTimeRemaining = (endTime) => {
  const now = Date.now();
  const diff = endTime - now;
  
  if (diff <= 0) return 'Ended';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  return `${days}d ${hours}h`;
};

// Fetch proposals when wallet connects
watch(isConnected, async (newVal) => {
  if (newVal) {
    await fetchProposals();
  }
});
</script>
