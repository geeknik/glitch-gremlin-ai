import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { GovernanceWorker } from '@glitch-gremlin/governance-worker'

export const useGovernanceStore = defineStore('governance', () => {
  const proposals = ref([])
  const activeProposals = computed(() => proposals.value.filter(p => p.status === 'active'))
  const pastProposals = computed(() => proposals.value.filter(p => p.status !== 'active'))
  
  const worker = new GovernanceWorker({
    rpcUrl: import.meta.env.VITE_SOLANA_RPC,
    programId: import.meta.env.VITE_GOVERNANCE_PROGRAM_ID
  })

  async function fetchProposals() {
    proposals.value = await worker.getProposals()
  }

  return {
    proposals,
    activeProposals,
    pastProposals,
    fetchProposals
  }
})
