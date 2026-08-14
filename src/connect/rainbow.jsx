import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, useAccount, useWalletClient } from 'wagmi';
import { http } from 'wagmi';
import { defineChain } from 'viem';
import {
  RainbowKitProvider,
  darkTheme,
  getDefaultConfig,
  useConnectModal,
  useAccountModal
} from '@rainbow-me/rainbowkit';
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

const wagmiConfig = getDefaultConfig({
  appName: 'Chess Wager',
  projectId,
  chains: [pulsechain],
  ssr: false,
  transports: {
    [pulsechain.id]: http('https://rpc.pulsechain.com')
  }
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

function RainbowBridge() {
  const { isConnected, address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();

  useEffect(() => {
    window.ChessRainbow = {
      ready: true,
      openConnectModal: () => openConnectModal?.(),
      openAccountModal: () => openAccountModal?.()
    };
    window.dispatchEvent(new Event('chess:rainbow-ready'));
    return () => {
      if (window.ChessRainbow) window.ChessRainbow.ready = false;
    };
  }, [openConnectModal, openAccountModal]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isConnected || !walletClient || !address) {
        if (!isConnected) clearExternalWallet('rainbow');
        return;
      }
      try {
        const signer = await walletClientToSigner(walletClient);
        const eth = {
          request: (args) => walletClient.request(args)
        };
        if (!cancelled) await applyExternalWallet(signer, address, 'rainbow', eth);
      } catch (err) {
        console.warn(err);
      }
    })();
    return () => { cancelled = true; };
  }, [isConnected, address, walletClient]);

  return null;
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
          modalSize="wide"
          initialChain={pulsechain}
        >
          <RainbowBridge />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
