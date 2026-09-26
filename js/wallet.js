// OWNLY AI Agent Launchpad - Wallet Manager with Reown (WalletConnect)
const REOWN_PROJECT_ID = '583d29a4170495336c4389362b59ba2c';

const WALLET_META = [
  { key: 'isMetaMask', name: 'MetaMask', icon: 'https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg', url: 'https://metamask.io/download/' },
  { key: 'isRabby', name: 'Rabby Wallet', icon: 'https://rabby.io/assets/images/logo.svg', url: 'https://rabby.io/' },
  { key: 'isCoinbaseWallet', name: 'Coinbase Wallet', icon: 'https://altcoinsbox.com/wp-content/uploads/2022/12/coinbase-logo-300x300.webp', url: 'https://www.coinbase.com/wallet' },
  { key: 'isTrust', name: 'Trust Wallet', icon: 'https://trustwallet.com/assets/images/media/assets/trust_platform.svg', url: 'https://trustwallet.com/download' },
  { key: 'isBitKeep', name: 'Bitget Wallet', icon: 'https://img.bitgetimg.com/multiLang/web/43cba33a57c039c9feef3a1178614dc9.png', url: 'https://web3.bitget.com/wallet-download' },
  { key: 'isOkxWallet', name: 'OKX Wallet', icon: 'https://static.okx.com/cdn/assets/imgs/247/58E63FEA47A2B7D7.png', url: 'https://www.okx.com/web3' },
  { key: 'isPhantom', name: 'Phantom', icon: 'https://phantom.app/img/phantom-logo.svg', url: 'https://phantom.app/download' },
  { key: 'isRainbow', name: 'Rainbow', icon: 'https://avatars.githubusercontent.com/u/48327834?s=200&v=4', url: 'https://rainbow.me/' },
];

class WalletManager {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.address = null;
    this.chainId = null;
    this.connected = false;
    this.listeners = [];
    this._wcProvider = null;
    this._wcLoading = null;
    this._eip6963Wallets = [];
    this._restoreFromStorage();
    this._listenEIP6963();
    this.ready = new Promise(r => setTimeout(r, 500)).then(() => this._autoReconnect());
  }

  _restoreFromStorage() {
    try {
      const saved = localStorage.getItem('ownly_wallet_connected');
      const addr = localStorage.getItem('ownly_wallet_address');
      if (saved && addr) {
        try { this.address = ethers.getAddress(addr); } catch { this.address = addr.toLowerCase(); }
        this.connected = true;
      }
    } catch {}
  }

  on(event, fn) {
    this.listeners.push({ event, fn });
  }

  emit(event, data) {
    this.listeners.filter(l => l.event === event).forEach(l => l.fn(data));
  }

  async _loadWCProvider() {
    if (this._wcProvider) return this._wcProvider;
    if (!REOWN_PROJECT_ID) return null;
    if (this._wcLoading) return this._wcLoading;
    this._wcLoading = (async () => {
      try {
        const module = await import('https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2/+esm');
        const EthereumProvider = module.EthereumProvider || module.default;
        if (EthereumProvider) {
          this._wcProvider = await EthereumProvider.init({
            projectId: REOWN_PROJECT_ID,
            chains: [4663],
            optionalChains: [4663],
            showQrModal: true,
            rpcMap: {
              4663: 'https://rpc.mainnet.chain.robinhood.com'
            },
            metadata: {
              name: 'OWNLY',
              description: 'AI Agent Launchpad on Robinhood Chain',
              url: window.location.origin,
              icons: [window.location.origin + '/assets/logo-sm.png']
            }
          });
          return this._wcProvider;
        }
      } catch (e) {
        console.warn('WalletConnect not available:', e);
      }
      return null;
    })();
    return this._wcLoading;
  }

  _listenEIP6963() {
    window.addEventListener('eip6963:announceProvider', (e) => {
      const exists = this._eip6963Wallets.find(w => w.info.uuid === e.detail.info.uuid);
      if (!exists) this._eip6963Wallets.push(e.detail);
    });
    window.dispatchEvent(new Event('eip6963:requestProvider'));
  }

  _detectWallets() {
    const wallets = [];
    const seen = new Set();

    for (const w of this._eip6963Wallets) {
      if (seen.has(w.info.name)) continue;
      seen.add(w.info.name);
      const matchedMeta = WALLET_META.find(m => w.info.name.toLowerCase().includes(m.name.toLowerCase().split(' ')[0]));
      wallets.push({
        name: w.info.name,
        icon: w.info.icon,
        provider: w.provider,
        key: matchedMeta?.key || w.info.name,
      });
    }

    const providers = window.ethereum?.providers || (window.ethereum ? [window.ethereum] : []);
    for (const p of providers) {
      for (const meta of WALLET_META) {
        if (p[meta.key] && !seen.has(meta.name)) {
          seen.add(meta.name);
          wallets.push({ name: meta.name, icon: meta.icon, provider: p, key: meta.key });
        }
      }
    }

    return wallets;
  }

  async _autoReconnect() {
    try {
      const saved = localStorage.getItem('ownly_wallet_connected');
      if (!saved) return;
      if (saved === 'external') {
        const provider = this._findProvider();
        if (!provider) return;
        let accounts;
        try { accounts = await provider.request({ method: 'eth_accounts' }); } catch { accounts = []; }
        if (!accounts.length) return;
        if (accounts.length) {
          this.provider = new ethers.BrowserProvider(provider);
          this.signer = await this.provider.getSigner();
          this.address = accounts[0];
          this.chainId = await provider.request({ method: 'eth_chainId' });
          this.connected = true;
          this._activeProvider = provider;
          try { localStorage.setItem('ownly_wallet_address', accounts[0]); } catch {}
          await window.contractManager.init(this.provider, this.signer);
          this.updateUI();
          this._setupExternalListeners(provider);
          this.emit('connected', { address: this.address });
        }
      } else if (saved === 'walletconnect') {
        const wc = await this._loadWCProvider();
        if (wc?.session) {
          try {
            const accounts = await wc.request({ method: 'eth_accounts' });
            if (accounts.length) {
              this.provider = new ethers.BrowserProvider(wc);
              this.signer = await this.provider.getSigner();
              this.address = accounts[0];
              this.chainId = '0x' + (4663).toString(16);
              this.connected = true;
              this._activeProvider = wc;
              await window.contractManager.init(this.provider, this.signer);
              this.updateUI();
              this._setupWCListeners();
              this.emit('connected', { address: this.address });
            } else { this._clearSaved(); }
          } catch { this._clearSaved(); }
        } else { this._clearSaved(); }
      }
    } catch {}
    this.updateUI();
  }

  _clearSaved() {
    try { localStorage.removeItem('ownly_wallet_connected'); localStorage.removeItem('ownly_wallet_address'); } catch {}
  }

  _findProvider() {
    if (this._eip6963Wallets.length) return this._eip6963Wallets[0].provider;
    if (window.ethereum) return window.ethereum;
    return null;
  }

  async ensureProvider() {
    if (this.signer) return true;
    const provider = this._findProvider();
    if (!provider) return false;
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (!accounts.length) return false;
      this.provider = new ethers.BrowserProvider(provider);
      this.signer = await this.provider.getSigner();
      this.address = accounts[0];
      this.chainId = await provider.request({ method: 'eth_chainId' });
      this.connected = true;
      this._activeProvider = provider;
      try { localStorage.setItem('ownly_wallet_connected', 'external'); localStorage.setItem('ownly_wallet_address', accounts[0]); } catch {}
      await window.contractManager.init(this.provider, this.signer);
      this.updateUI();
      this._setupExternalListeners(provider);
      return true;
    } catch { return false; }
  }

  connect() {
    this._showConnectModal();
  }

  _showConnectModal() {
    if (document.getElementById('connectModal')) return;

    const walletList = this._detectWallets();

    const walletsHtml = walletList.length ? walletList.map((w, i) => `
      <button class="connect-option" data-wallet-idx="${i}">
        <img src="${w.icon}" alt="${w.name}" width="36" height="36" onerror="this.style.background='var(--surface-2)';this.style.padding='6px'">
        <div class="connect-option-info">
          <span class="connect-option-name">${w.name}</span>
          <span class="connect-option-desc">Detected</span>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" stroke-width="2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    `).join('') : '<p style="text-align:center;color:var(--text-3);font-size:13px;padding:12px 0">No wallet detected. Use WalletConnect below.</p>';

    const modal = document.createElement('div');
    modal.id = 'connectModal';
    modal.className = 'connect-modal-overlay';
    modal.innerHTML = `
      <div class="connect-modal">
        <div class="connect-modal-header">
          <h3>Connect Wallet</h3>
          <button class="connect-modal-close" id="connectModalClose">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="connect-modal-body">
          ${walletsHtml}
          <div class="connect-divider"><span>or</span></div>
          <button class="connect-option connect-option-social" id="optWalletConnect">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="6" fill="#3396FF"/><path d="M10.4 12.8c3.1-3 8.1-3 11.2 0l.4.4c.2.2.2.4 0 .6l-1.2 1.2c-.1.1-.2.1-.3 0l-.5-.5c-2.2-2.1-5.7-2.1-7.8 0l-.6.5c-.1.1-.2.1-.3 0l-1.2-1.2c-.2-.2-.2-.4 0-.6l.3-.4zm13.8 2.6l1.1 1c.2.2.2.4 0 .6l-4.8 4.7c-.2.2-.4.2-.6 0l-3.4-3.3c0-.1-.1-.1-.2 0l-3.4 3.3c-.2.2-.4.2-.6 0l-4.8-4.7c-.2-.2-.2-.4 0-.6l1.1-1c.2-.2.4-.2.6 0l3.4 3.3c0 .1.1.1.2 0l3.4-3.3c.2-.2.4-.2.6 0l3.4 3.3c0 .1.1.1.2 0l3.4-3.3c.1-.2.3-.2.5 0z" fill="#fff"/></svg>
            <div class="connect-option-info">
              <span class="connect-option-name">WalletConnect</span>
              <span class="connect-option-desc">Scan with mobile wallet</span>
            </div>
          </button>
        </div>
        <div class="connect-modal-footer">
          <p>Powered by <strong>Reown</strong></p>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('connectModalClose').onclick = () => this._closeModal();
    modal.onclick = (e) => { if (e.target === modal) this._closeModal(); };

    modal.querySelectorAll('[data-wallet-idx]').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.walletIdx);
        const wallet = walletList[idx];
        this._closeModal();
        if (wallet.provider) {
          this._connectWithProvider(wallet.provider, wallet.name);
        }
      };
    });

    document.getElementById('optWalletConnect').onclick = () => {
      this._closeModal();
      this._connectWalletConnect();
    };
  }

  _closeModal() {
    const modal = document.getElementById('connectModal');
    if (modal) modal.remove();
  }

  async _connectWithProvider(walletProvider, walletName) {
    try {
      const accounts = await walletProvider.request({ method: 'eth_requestAccounts' });
      if (!accounts.length) {
        showToast('No accounts found. Please unlock your wallet.', 'error');
        return false;
      }

      this.provider = new ethers.BrowserProvider(walletProvider);
      this.signer = await this.provider.getSigner();
      this.address = accounts[0];
      this.chainId = await walletProvider.request({ method: 'eth_chainId' });
      this.connected = true;
      this._activeProvider = walletProvider;
      try { localStorage.setItem('ownly_wallet_connected', 'external'); localStorage.setItem('ownly_wallet_address', accounts[0]); } catch {}

      await window.contractManager.init(this.provider, this.signer);

      if (this.chainId !== CONTRACTS.CHAIN_CONFIG.chainId) {
        await window.contractManager.switchToRobinhood();
      }

      this.updateUI();
      this._setupExternalListeners(walletProvider);
      this.emit('connected', { address: this.address });
      showToast(`Connected: ${walletName}`, 'success');
      return true;
    } catch (err) {
      if (err.code === 4001) {
        showToast('Connection rejected by user.', 'error');
      } else {
        showToast('Failed to connect wallet.', 'error');
        console.error(err);
      }
      return false;
    }
  }

  async _connectWalletConnect() {
    showToast('Loading WalletConnect...', 'info');
    const wc = await this._loadWCProvider();
    if (!wc) {
      showToast('WalletConnect not available. Please use a browser wallet.', 'error');
      return;
    }
    try {
      const accounts = await wc.enable();
      if (!accounts.length) {
        showToast('No accounts found.', 'error');
        return;
      }
      this.provider = new ethers.BrowserProvider(wc);
      this.signer = await this.provider.getSigner();
      this.address = accounts[0];
      this.chainId = '0x' + (4663).toString(16);
      this.connected = true;
      this._activeProvider = wc;
      try { localStorage.setItem('ownly_wallet_connected', 'walletconnect'); localStorage.setItem('ownly_wallet_address', accounts[0]); } catch {}
      await window.contractManager.init(this.provider, this.signer);
      this.updateUI();
      this._setupWCListeners();
      this.emit('connected', { address: this.address });
      showToast(`Connected: ${this.shortAddress()}`, 'success');
    } catch (err) {
      if (err.message?.includes('User rejected') || err.code === 4001) {
        showToast('Connection rejected.', 'error');
      } else {
        showToast('WalletConnect failed. Please use a browser wallet.', 'error');
        console.error(err);
      }
    }
  }

  _setupWCListeners() {
    if (!this._wcProvider) return;
    this._wcProvider.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        this.disconnect();
      } else {
        this.address = accounts[0];
        this.updateUI();
        this.emit('accountChanged', { address: this.address });
      }
    });
    this._wcProvider.on('chainChanged', (chainId) => {
      this.chainId = chainId;
      this.emit('chainChanged', { chainId });
    });
    this._wcProvider.on('disconnect', () => {
      this.disconnect();
    });
  }

  async disconnect() {
    if (this._wcProvider?.session) {
      try { await this._wcProvider.disconnect(); } catch {}
    }
    this._clearSaved();
    this._activeProvider = null;
    this.provider = null;
    this.signer = null;
    this.address = null;
    this.connected = false;
    this.updateUI();
    this.emit('disconnected');
    showToast('Wallet disconnected.', 'info');
  }

  _setupExternalListeners(walletProvider) {
    const p = walletProvider || window.ethereum;
    if (!p) return;

    p.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        this.disconnect();
      } else {
        this.address = accounts[0];
        this.updateUI();
        this.emit('accountChanged', { address: this.address });
      }
    });

    p.on('chainChanged', (chainId) => {
      this.chainId = chainId;
      this.emit('chainChanged', { chainId });
      if (chainId !== CONTRACTS.CHAIN_CONFIG.chainId) {
        showToast('Please switch to Robinhood network.', 'info');
      }
    });
  }

  shortAddress() {
    if (!this.address) return '';
    return this.address.slice(0, 6) + '...' + this.address.slice(-4);
  }

  updateUI() {
    const btns = document.querySelectorAll('#btnConnect, #btnConnectMobile');
    btns.forEach(btn => {
      if (this.connected) {
        btn.innerHTML = `<span>${this.shortAddress()}</span>`;
        btn.classList.add('connected');
      } else {
        btn.innerHTML = `<span>Connect Wallet</span>`;
        btn.classList.remove('connected');
      }
    });

    const prompt = document.getElementById('portfolioPrompt');
    if (prompt && this.connected) {
      this.emit('connected', { address: this.address });
    }
  }

  async getBalance() {
    if (!this.address) return '0';
    try {
      const addr = ethers.getAddress(this.address);
      const p = this.provider || window.contractManager._rp();
      const balance = await p.getBalance(addr);
      return ethers.formatEther(balance);
    } catch { return '0'; }
  }

  async getTokenBalance(tokenAddress) {
    if (!this.address) return 0n;
    try {
      const token = window.contractManager.getToken(tokenAddress);
      const balance = await token.balanceOf(this.address);
      return balance;
    } catch {
      return 0n;
    }
  }
}

window.walletManager = new WalletManager();
