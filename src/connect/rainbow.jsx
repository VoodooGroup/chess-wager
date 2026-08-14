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
import { injected, walletConnect } from 'wagmi/connectors';
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

const WC_ICON =
  "data:image/svg+xml,%3Csvg%20width%3D%2228%22%20height%3D%2228%22%20viewBox%3D%220%200%2028%2028%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%3Crect%20width%3D%2228%22%20height%3D%2228%22%20fill%3D%22%233B99FC%22%2F%3E%0A%3Cpath%20d%3D%22M8.38969%2010.3739C11.4882%207.27538%2016.5118%207.27538%2019.6103%2010.3739L19.9832%2010.7468C20.1382%2010.9017%2020.1382%2011.1529%2019.9832%2011.3078L18.7076%2012.5835C18.6301%2012.6609%2018.5045%2012.6609%2018.4271%2012.5835L17.9139%2012.0703C15.7523%209.9087%2012.2477%209.9087%2010.0861%2012.0703L9.53655%2012.6198C9.45909%2012.6973%209.3335%2012.6973%209.25604%2012.6198L7.98039%2011.3442C7.82547%2011.1893%207.82547%2010.9381%207.98039%2010.7832L8.38969%2010.3739ZM22.2485%2013.012L23.3838%2014.1474C23.5387%2014.3023%2023.5387%2014.5535%2023.3838%2014.7084L18.2645%2019.8277C18.1096%2019.9827%2017.8584%2019.9827%2017.7035%2019.8277L14.0702%2016.1944C14.0314%2016.1557%2013.9686%2016.1557%2013.9299%2016.1944L10.2966%2019.8277C10.1417%2019.9827%209.89053%2019.9827%209.73561%2019.8278L4.61619%2014.7083C4.46127%2014.5534%204.46127%2014.3022%204.61619%2014.1473L5.75152%2013.012C5.90645%2012.857%206.15763%2012.857%206.31255%2013.012L9.94595%2016.6454C9.98468%2016.6841%2010.0475%2016.6841%2010.0862%2016.6454L13.7194%2013.012C13.8743%2012.857%2014.1255%2012.857%2014.2805%2013.012L17.9139%2016.6454C17.9526%2016.6841%2018.0154%2016.6841%2018.0541%2016.6454L21.6874%2013.012C21.8424%2012.8571%2022.0936%2012.8571%2022.2485%2013.012Z%22%20fill%3D%22white%22%2F%3E%0A%3C%2Fsvg%3E%0A";

function stripWalletConnectFallback(wallet) {
  if (!wallet || wallet.id === 'walletConnect' || wallet.id === 'voodoo-wc-qr') return wallet;
  const next = { ...wallet };
  if (next.qrCode) {
    const { getUri, ...rest } = next.qrCode;
    next.qrCode = Object.keys(rest).length ? rest : undefined;
  }
  if (next.desktop?.getUri) {
    const { getUri, ...rest } = next.desktop;
    next.desktop = Object.keys(rest).length ? rest : undefined;
  }
  if (next.mobile?.getUri) {
    const { getUri, ...rest } = next.mobile;
    next.mobile = Object.keys(rest).length ? rest : undefined;
  }
  if (next.id === 'voodoo' || next.id === 'metaMask' || next.id === 'rabby' || next.id === 'brave') {
    delete next.qrCode;
    delete next.mobile;
    delete next.desktop;
  }
  return next;
}

function asListed(factory) {
  return (opts) => stripWalletConnectFallback(factory(opts));
}

function wcMetadata() {
  return {
    name: 'Chess Wager',
    description: 'Play chess. Winner takes the pot.',
    url: typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://voodootoken.com',
    icons: ['https://voodootoken.com/Voodoo-Token-Logo.png']
  };
}

function walletConnectOfficial({ projectId: id } = {}) {
  if (!id) throw new Error('walletConnectOfficial requires projectId');
  return {
    id: 'voodoo-walletconnect',
    name: 'WalletConnect',
    shortName: 'WalletConnect',
    iconUrl: async () => WC_ICON,
    iconBackground: '#3b99fc',
    iconAccent: '#3b99fc',
    installed: true,
    createConnector: (walletDetails) => {
      const factory = walletConnect({
        projectId: id,
        showQrModal: true,
        metadata: wcMetadata(),
        customStoragePrefix: 'voodoo-wc-official'
      });
      return (config) => {
        const connector = factory(config);
        return {
          ...connector,
          ...walletDetails,
          id: 'voodoo-walletconnect',
          name: 'WalletConnect',
          type: 'walletConnect'
        };
      };
    }
  };
}

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
  multiInjectedProviderDiscovery: false,
  wallets: [
    {
      groupName: 'Popular',
      wallets: [
        asListed(voodooWallet),
        asListed(metaMaskWallet),
        walletConnectOfficial,
        asListed(rabbyWallet),
        asListed(trustWallet),
        asListed(braveWallet),
        asListed(okxWallet),
        asListed(ledgerWallet)
      ]
    },
    {
      groupName: 'Other EVM Wallets',
      wallets: [
        asListed(frameWallet),
        asListed(zerionWallet),
        asListed(tokenPocketWallet),
        asListed(imTokenWallet),
        asListed(bitgetWallet),
        asListed(bybitWallet),
        asListed(coin98Wallet),
        asListed(injectedWallet)
      ]
    }
  ],
  walletConnectParameters: {
    metadata: wcMetadata()
  },
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
