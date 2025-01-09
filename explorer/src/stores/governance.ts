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

  // Rate limiting state
  const lastFetch = ref(0)
  const fetchCount = ref(0)
  
  async function fetchProposals() {
    const now = Date.now()
    
    // Rate limiting
    if (now - lastFetch.value < 2000) {
      throw new Error('Rate limit exceeded - wait 2 seconds between fetches')
    }
    if (fetchCount.value > 10) {
      throw new Error('Too many requests - wait 1 minute')
    }
    
    try {
      proposals.value = await worker.getProposals({
        includeVotes: true,
        includeStakes: true,
        includeRewards: true
      })
      
      // Update rate limiting state
      lastFetch.value = now
      fetchCount.value++
      
      // Reset counter after 1 minute
      setTimeout(() => {
        fetchCount.value = 0
      }, 60000)
      
    } catch (error) {
      console.error('Failed to fetch proposals:', error)
      throw new GlitchError('Failed to fetch proposals', 1017)
    }
  }

  async function delegateStake(stakeId: string, delegateAddress: string) {
    try {
      // Validate inputs
      if (!stakeId || !delegateAddress) {
        throw new GlitchError('Invalid stake ID or delegate address', 1018)
      }
      
      // Check if delegate is valid
      const isValid = await worker.validateDelegate(delegateAddress)
      if (!isValid) {
        throw new GlitchError('Invalid delegate address', 1019)
      }
      
      // Perform delegation
      await worker.delegateStake(stakeId, delegateAddress)
      
      // Refresh data
      await fetchProposals()
      
    } catch (error) {
      console.error('Delegation failed:', error)
      throw new GlitchError('Delegation failed', 1020)
    }
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
