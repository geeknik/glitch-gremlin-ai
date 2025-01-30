import React, { act } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChaosMonitor } from './ChaosMonitor';
import { PublicKey } from '@solana/web3.js';

const mockProposalKey = new PublicKey('11111111111111111111111111111111');

describe('ChaosMonitor', () => {
  it('handles fetch error gracefully', async () => {
    const mockErrorFetch = jest.fn().mockRejectedValue(new Error('Fetch failed'));
    jest.useFakeTimers();
    
    render(
      <ChaosMonitor
        proposalKey={mockProposalKey}
        fetchTestStatus={mockErrorFetch}
      />
    );

    // Wait for initial fetch and error state
    await act(async () => {
      await Promise.resolve(); // Let all promises resolve
      jest.runAllTimers(); // Run all timers
    });

    // Verify error state
    expect(screen.getByText('Failed to fetch test status')).toBeInTheDocument();
    expect(mockErrorFetch).toHaveBeenCalled();

    jest.useRealTimers();
  }, 30000); // Increase timeout to 30 seconds
}); 
