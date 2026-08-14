import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, useAccount, useWalletClient } from 'wagmi';
import { http } from 'wagmi';
import { defineChain } from 'viem';
import {
  RainbowKitProvider,
  lightTheme,
  getDefaultConfig,
  useConnectModal,
  useAccountModal
} from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  walletConnectWallet,
  rabbyWallet,
  trustWallet,
  braveWallet,
  okxWallet,
  ledgerWallet,
  frameWallet,
  zerionWallet,
  tokenPocketWallet,
  imTokenWallet,
  bitgetWallet,
  bybitWallet,
  coin98Wallet,
  injectedWallet
} from '@rainbow-me/rainbowkit/wallets';
import { injected } from 'wagmi/connectors';
import { BrowserProvider } from 'ethers';
import { applyExternalWallet, clearExternalWallet } from '../app.js';
import { VOODOO_INSTALL_URL, isVoodooProvider } from '../lib/wallet.js';
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

function findVoodooInjected() {
  if (typeof window === 'undefined') return undefined;
  if (window.voodooEthereum && isVoodooProvider(window.voodooEthereum)) return window.voodooEthereum;
  if (window.VoodooWalletProvider && isVoodooProvider(window.VoodooWalletProvider)) return window.VoodooWalletProvider;
  if (isVoodooProvider(window.ethereum)) return window.ethereum;
  const list = window.ethereum?.providers;
  if (Array.isArray(list)) return list.find(isVoodooProvider);
  return undefined;
}

function voodooWallet() {
  return {
    id: 'voodoo',
    name: 'Voodoo Wallet',
    shortName: 'Voodoo',
    iconUrl: `${import.meta.env.BASE_URL}voodoo-wallet.png`,
    iconBackground: '#ffffff',
    iconAccent: '#073749',
    installed: Boolean(findVoodooInjected()),
    downloadUrls: {
      browserExtension: VOODOO_INSTALL_URL,
      chrome: VOODOO_INSTALL_URL
    },
    extension: {
      instructions: {
        learnMoreUrl: VOODOO_INSTALL_URL,
        steps: [
          { step: 'install', title: 'Install Voodoo Wallet', description: 'Install the Voodoo Wallet browser extension, then refresh this page.' },
          { step: 'create', title: 'Unlock the extension', description: 'Open Voodoo Wallet and unlock / sign in.' },
          { step: 'refresh', title: 'Connect again', description: 'Click Voodoo Wallet again to open the extension connect prompt.' }
        ]
      }
    },
    createConnector: (walletDetails) =>
      injected({
        target: () => ({
          id: 'voodoo',
          name: 'Voodoo Wallet',
          provider: findVoodooInjected()
        }),
        ...walletDetails
      })
  };
}

const rkTheme = lightTheme({
  accentColor: '#2563eb',
  accentColorForeground: '#ffffff',
  borderRadius: 'large',
  fontStack: 'system',
  overlayBlur: 'small'
});
rkTheme.colors.modalBackground = '#ffffff';
rkTheme.colors.modalBorder = 'rgba(15, 23, 42, 0.10)';
rkTheme.colors.modalBackdrop = 'rgba(15, 23, 42, 0.45)';
rkTheme.colors.profileForeground = '#ffffff';
rkTheme.colors.menuItemBackground = 'rgba(37, 99, 235, 0.08)';
rkTheme.colors.closeButtonBackground = 'rgba(15, 23, 42, 0.06)';
rkTheme.colors.generalBorder = 'rgba(15, 23, 42, 0.10)';

const wagmiConfig = getDefaultConfig({
  appName: 'Chess Wager',
  appDescription: 'Play chess. Winner takes the pot.',
  appUrl: typeof window !== 'undefined' ? window.location.origin : 'https://voodootoken.com',
  appIcon: 'https://voodootoken.com/Voodoo-Token-Logo.png',
  projectId,
  chains: [pulsechain],
  ssr: false,
  wallets: [
    {
      groupName: 'Popular',
      wallets: [
        voodooWallet,
        metaMaskWallet,
        walletConnectWallet,
        rabbyWallet,
        trustWallet,
        braveWallet,
        okxWallet,
        ledgerWallet
      ]
    },
    {
      groupName: 'Other EVM Wallets',
      wallets: [
        frameWallet,
        zerionWallet,
        tokenPocketWallet,
        imTokenWallet,
        bitgetWallet,
        bybitWallet,
        coin98Wallet,
        injectedWallet
      ]
    }
  ],
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
          theme={rkTheme}
          modalSize="wide"
          initialChain={pulsechain}
          showRecentTransactions={false}
          appInfo={{
            appName: 'Chess Wager',
            learnMoreUrl: 'https://voodootoken.com'
          }}
        >
          <RainbowBridge />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
