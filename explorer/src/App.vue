<template>
  <div class="container mx-auto px-4 py-8">
    <WalletConnection />
    <GovernanceDashboard v-if="isConnected" />
    <ProposalList v-if="isConnected" />
    <StakingInterface v-if="isConnected" />
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useAppKitAccount } from '@reown/appkit/vue'
import WalletConnection from './components/WalletConnection.vue';
import GovernanceDashboard from './components/GovernanceDashboard.vue';
import ProposalList from './components/ProposalList.vue';
import StakingInterface from './components/StakingInterface.vue';

const { isConnected } = useAppKitAccount()
</script>
