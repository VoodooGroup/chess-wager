import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, useAccount, useWalletClient } from 'wagmi';
import { createConfig, http } from 'wagmi';
import { defineChain } from 'viem';
import {
  RainbowKitProvider,
  ConnectButton,
  darkTheme,
  connectorsForWallets
} from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  rainbowWallet,
  rabbyWallet,
  injectedWallet,
  walletConnectWallet
} from '@rainbow-me/rainbowkit/wallets';
import { BrowserProvider } from 'ethers';
import { applyExternalWallet, clearExternalWallet } from '../app.js';
import '@rainbow-me/rainbowkit/styles.css';

const pulsechain = defineChain({
  id: 369,
  name: 'PulseChain',
  nativeCurrency: { name: 'Pulse', symbol: 'PLS', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.pulsechain.com'] }
  },
  blockExplorers: {
    default: { name: 'PulseScan', url: 'https://scan.pulsechain.com' }
  }
});

const projectId = import.meta.env.VITE_WC_PROJECT_ID || '21fef48091f12692cad574a6f7753643';

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Suggested',
      wallets: [injectedWallet, metaMaskWallet, rabbyWallet, rainbowWallet, walletConnectWallet]
    }
  ],
  { appName: 'Chess Wager', projectId }
);

const wagmiConfig = createConfig({
  chains: [pulsechain],
  connectors,
  transports: {
    [pulsechain.id]: http('https://rpc.pulsechain.com')
  },
  ssr: false
});

const queryClient = new QueryClient();

function walletClientToSigner(walletClient) {
  const { account, chain, transport } = walletClient;
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address
  };
  const provider = new BrowserProvider(transport, network);
  return provider.getSigner(account.address);
}

function OtherButton() {
  const { isConnected, address } = useAccount();
  const { data: walletClient } = useWalletClient();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isConnected || !walletClient || !address) {
        if (!isConnected) clearExternalWallet();
        return;
      }
      try {
        const signer = await walletClientToSigner(walletClient);
        if (!cancelled) await applyExternalWallet(signer, address);
      } catch (err) {
        console.warn(err);
      }
    })();
    return () => { cancelled = true; };
  }, [isConnected, address, walletClient]);

  return (
    <ConnectButton.Custom>
      {({ openConnectModal, openAccountModal, mounted }) => {
        const ready = mounted;
        if (!ready) return null;
        if (isConnected) {
          return (
            <button type="button" className="btn ghost wallet-extra" onClick={openAccountModal}>
              Other
            </button>
          );
        }
        return (
          <button type="button" className="btn" onClick={openConnectModal}>
            Other
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

export function mountRainbow(el) {
  if (!el) return;
  createRoot(el).render(
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#d7b15a',
            accentColorForeground: '#1a1408',
            borderRadius: 'medium'
          })}
          modalSize="compact"
          initialChain={pulsechain}
        >
          <OtherButton />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
