import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { GovernanceWorker } from '@glitch-gremlin/governance-worker'

export const useGovernanceStore = defineStore('governance', () => {
  const proposals = ref([])
  const activeProposals = computed(() => proposals.value.filter(p => p.status === 'active'))
  const pastProposals = computed(() => proposals.value.filter(p => p.status !== 'active'))
  
  const worker = new GovernanceWorker({
    rpcUrl: import.meta.env.VITE_SOLANA_RPC,
    programId: new PublicKey(import.meta.env.VITE_PROGRAM_ID),
    tokenProgramId: new PublicKey(import.meta.env.VITE_TOKEN_PROGRAM_ID),
    mainProgramId: new PublicKey(import.meta.env.VITE_MAIN_PROGRAM_ID)
  })

  async function fetchProposals() {
    proposals.value = await worker.getProposals({
      includeVotes: true,
      includeStakes: true,
      includeRewards: true
    })
  }

  async function delegateStake(stakeId: string, delegateAddress: string) {
    await worker.delegateStake(stakeId, delegateAddress)
    await fetchProposals()
  }

  async function claimRewards(stakeId: string) {
    await worker.claimRewards(stakeId)
    await fetchProposals()
  }

  return {
    proposals,
    activeProposals,
    pastProposals,
    fetchProposals
  }
})
