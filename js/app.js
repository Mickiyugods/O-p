// OWNLY Token Launchpad - Main App
// On-chain Deploy, Buy/Sell trading on Robinhood Chain

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const icons = {
    success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 4000);
}

class Router {
  constructor(routes, fallback) {
    this.routes = routes;
    this.fallback = fallback;
    window.addEventListener('popstate', () => this.resolve());
    document.addEventListener('click', e => {
      const link = e.target.closest('[data-link]');
      if (link) {
        e.preventDefault();
        const href = link.getAttribute('href');
        if (href) this.navigate(href);
      }
    });
  }
  navigate(path) {
    window.history.pushState(null, '', path);
    this.resolve();
  }
  resolve() {
    const path = window.location.pathname || '/';
    const tb = document.getElementById('tickerBar');
    if (tb) tb.style.display = '';
    for (const route of this.routes) {
      const match = path.match(route.pattern);
      if (match) { route.handler(match); this.updateActiveLink(path); window.scrollTo(0, 0); return; }
    }
    if (this.fallback) this.fallback(path);
    else this.routes[0].handler([]);
  }
  updateActiveLink(path) {
    document.querySelectorAll('.nav-link[data-link]').forEach(l => {
      l.classList.toggle('active', l.getAttribute('href') === path);
    });
  }
}

// Featured / Official agents — add agent addresses here after deploying
const FEATURED_TOKENS = [];

class App {
  constructor() {
    this.chart = null;
    this.refreshInterval = null;
    this.tradeMode = 'buy';
    this.slippageBps = 200;
    this.currentTradeToken = null;

    this.router = new Router([
      { pattern: /^\/$/, handler: () => this.renderHome() },
      { pattern: /^\/create$/, handler: () => this.renderCreate() },
      { pattern: /^\/portfolio$/, handler: () => this.renderPortfolio() },
      { pattern: /^\/how$/, handler: () => this.renderHow() },
      { pattern: /^\/docs$/, handler: () => this.renderDocs() },
      { pattern: /^\/privacy$/, handler: () => this.renderLegal('tpl-privacy') },
      { pattern: /^\/terms$/, handler: () => this.renderLegal('tpl-terms') },
      { pattern: /^\/token\/(.+)$/, handler: (m) => this.openToken(m[1]) },
      { pattern: /^\/agents$/, handler: () => this.renderAgents() },
    ], (path) => this.render404(path));

    window.walletManager.on('connected', () => {
      this.updateUI();
      if (window.location.pathname === '/portfolio') this.renderPortfolio();
      if (this.currentTradeToken && window.location.pathname.startsWith('/token/')) this.updateTradeUI(this.currentTradeToken);
    });
    window.walletManager.on('disconnected', () => {
      this.updateUI();
      if (this.currentTradeToken && window.location.pathname.startsWith('/token/')) this.updateTradeUI(this.currentTradeToken);
    });
    window.walletManager.on('accountChanged', () => {
      if (this.currentTradeToken && window.location.pathname.startsWith('/token/')) this.updateTradeUI(this.currentTradeToken);
    });

    this.initNavbar();
    window.walletManager.ready.then(() => {
      this.router.resolve();
      window.walletManager.updateUI();
    });
  }

  updateUI() {
    const btn = document.getElementById('btnConnect');
    if (btn) btn.textContent = window.walletManager.connected ? window.walletManager.shortAddress() : 'Connect Wallet';
    const btnMobile = document.getElementById('btnConnectMobile');
    if (btnMobile) btnMobile.textContent = window.walletManager.connected ? window.walletManager.shortAddress() : 'Connect';
  }

  initNavbar() {
    const menu = document.getElementById('mobileMenu');
    const nav = document.getElementById('mobileNav');
    menu.addEventListener('click', () => nav.classList.toggle('open'));
    nav.querySelectorAll('.nav-link').forEach(l => l.addEventListener('click', () => nav.classList.remove('open')));
    document.getElementById('btnConnect').addEventListener('click', () => {
      if (window.walletManager.connected) this.router.navigate('/portfolio');
      else window.walletManager.connect();
    });
    const btnMobile = document.getElementById('btnConnectMobile');
    if (btnMobile) btnMobile.addEventListener('click', () => {
      if (window.walletManager.connected) this.router.navigate('/portfolio');
      else window.walletManager.connect();
    });
  }

  // Formatting
  fmt(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toLocaleString();
  }
  fmtPrice(p) {
    if (!p || p === 0) return '$0';
    if (p < 0.000001) return '$' + p.toExponential(2);
    if (p < 0.01) return '$' + p.toFixed(8);
    if (p < 1) return '$' + p.toFixed(6);
    if (p < 1000) return '$' + p.toFixed(4);
    return '$' + this.fmt(p);
  }
  fmtUSD(n) {
    if (!n) return '$0';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(2) + 'K';
    return '$' + n.toFixed(2);
  }
  fmtETH(n) {
    if (!n || n === 0) return '0';
    if (n < 0.0001) {
      const s = n.toFixed(18);
      const m = s.match(/^0\.(0+)(\d{1,4})/);
      if (m) return `0.0<sub>${m[1].length}</sub>${m[2].replace(/0+$/, '')}`;
    }
    if (n < 1) return n.toFixed(6);
    return n.toFixed(4);
  }
  fmtTokens(n) {
    if (!n) return '0';
    if (typeof n === 'bigint') n = Number(ethers.formatEther(n));
    return this.fmt(n);
  }
  esc(str) {
    if (!str) return '';
    const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
  }
  fixLogoUrl(logo) {
    if (!logo) return '';
    if (logo.startsWith('ipfs://')) return 'https://gateway.pinata.cloud/ipfs/' + logo.slice(7);
    if (logo.startsWith('data:') || logo.startsWith('http://') || logo.startsWith('https://')) return logo;
    if (logo.startsWith('/assets/') || logo.startsWith('assets/')) return logo;
    return '';
  }
  timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  // ---- HOME ----
  async renderHome() {
    if (this._tradesInterval) { clearInterval(this._tradesInterval); this._tradesInterval = null; }
    const sb = document.getElementById('searchBar');
    if (sb) sb.style.display = 'none';
    const ticker = document.getElementById('tickerBar');
    if (ticker) ticker.style.display = '';

    this.currentSort = 'newest';
    const tpl = document.getElementById('tpl-home').content.cloneNode(true);
    document.getElementById('app').replaceChildren(tpl);
    this.renderFeatured();
    this.updateStats();
    this.updateChainInfo();
    await this.loadTokens();

    const exploreSearch = document.getElementById('exploreSearch');
    if (exploreSearch && !exploreSearch._ownlyBound) {
      let st;
      exploreSearch.addEventListener('input', () => {
        clearTimeout(st);
        st = setTimeout(() => {
          if (window.location.pathname === '/') {
            this.loadTokens(exploreSearch.value.trim());
          }
        }, 300);
      });
      exploreSearch._ownlyBound = true;
    }

    document.querySelectorAll('.sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentSort = btn.dataset.sort;
        const q = exploreSearch ? exploreSearch.value.trim() : '';
        this.loadTokens(q, true);
      });
    });

    if (this.refreshInterval) clearInterval(this.refreshInterval);
    this.refreshInterval = setInterval(() => {
      if (window.location.pathname === '/') {
          const q = document.getElementById('exploreSearch')?.value.trim() || '';
          this.loadTokens(q, true);
        }
    }, 15000);
  }

  async renderFeatured() {
    const section = document.getElementById('officialSection');
    const container = document.getElementById('officialCards');
    if (!section || !container || !FEATURED_TOKENS.length) return;

    section.style.display = '';

    const buildCardHtml = (token) => {
      const logoSrc = this.fixLogoUrl(token.logo);
      const initial = this.esc(token.symbol?.charAt(0) || '?');
      const logoHtml = logoSrc
        ? `<img src="${logoSrc}" alt="${this.esc(token.symbol)}" onerror="this.replaceWith(document.createTextNode('${initial}'))">`
        : `<span class="official-card-initial">${initial}</span>`;
      const desc = token.description ? this.esc(token.description).slice(0, 100) : '';
      const hasStats = token.marketCapUsd != null || token.priceUsd != null || token.progressPct != null;
      const progress = token.progressPct || 0;
      const statsHtml = hasStats
        ? `${token.marketCapUsd != null ? `<div class="official-stat"><span class="official-stat-label">Market Cap</span><span class="official-stat-value">${this.fmtUSD(token.marketCapUsd)}</span></div>` : ''}
           ${token.priceUsd != null ? `<div class="official-stat"><span class="official-stat-label">Price</span><span class="official-stat-value">${token.priceUsd < 0.01 ? '$' + token.priceUsd.toFixed(8) : this.fmtUSD(token.priceUsd)}</span></div>` : ''}
           ${token.progressPct != null ? `<div class="official-stat"><span class="official-stat-label">Progress</span><span class="official-stat-value">${progress.toFixed(1)}%</span><div class="official-progress"><div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100, progress)}%"></div></div></div></div>` : ''}`
        : `<div class="official-stat"><span class="official-stat-label">Market Cap</span><span class="official-stat-value official-stat-loading"><span class="sk-line w80" style="height:14px"></span></span></div>
           <div class="official-stat"><span class="official-stat-label">Price</span><span class="official-stat-value official-stat-loading"><span class="sk-line w80" style="height:14px"></span></span></div>
           <div class="official-stat"><span class="official-stat-label">Progress</span><span class="official-stat-value official-stat-loading"><span class="sk-line w80" style="height:14px"></span></span></div>`;
      return `
        <div class="official-card" data-addr="${token.address || ''}">
          <div class="official-card-left">
            <div class="official-card-logo">${logoHtml}</div>
            <div class="official-card-info">
              <div class="official-card-top">
                <span class="official-card-name">${this.esc(token.name)}</span>
                <span class="official-card-symbol">$${this.esc(token.symbol)}</span>
                <span class="official-badge">Official</span>
              </div>
              ${desc ? `<div class="official-card-desc">${desc}</div>` : ''}
              <div class="official-card-tags">
                <span class="official-tag">Launchpad</span>
                <span class="official-tag">Community</span>
                <span class="official-tag">AI Powered</span>
              </div>
            </div>
          </div>
          <div class="official-card-right">
            <div class="official-card-stats">${statsHtml}</div>
            <div class="official-card-action">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>
            </div>
          </div>
        </div>`;
    };

    container.innerHTML = FEATURED_TOKENS.map(ft => buildCardHtml(ft)).join('');
    const bindClicks = () => {
      container.querySelectorAll('.official-card').forEach(card => {
        card.addEventListener('click', () => {
          const addr = card.dataset.addr;
          if (addr) this.router.navigate('/token/' + addr);
        });
      });
    };
    bindClicks();

    const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
    const tokensToFetch = FEATURED_TOKENS.filter(ft => ft.address && !ft._fetched);
    if (!tokensToFetch.length) return;

    const cm = window.contractManager;
    const ethPricePromise = fetchEthPrice().catch(() => {});
    const onChainResults = await Promise.all(tokensToFetch.map(async (ft) => {
      try {
        const fetcher = ft.curve && cm.getTokenOnChainDataFast
          ? cm.getTokenOnChainDataFast(ft.address, ft.curve)
          : cm.getTokenOnChainData(ft.address);
        return { ft, data: await withTimeout(fetcher, 3000) };
      } catch { return { ft, data: null }; }
    }));
    await ethPricePromise;

    for (const { ft, data: onChain } of onChainResults) {
      if (!onChain) continue;
      const qr = onChain.quoteReserve;
      const tr = onChain.tokenReserve;
      const priceEth = tr > 0n ? Number(qr) / Number(tr) : 0;
      const priceUsd = priceEth * ETH_PRICE_USD;
      const mcap = priceUsd * CONTRACTS.TOKEN_SUPPLY;
      const progressPct = onChain.progressBps / 100;
      const token = { ...ft, priceEth, priceUsd, marketCapUsd: mcap, progressPct, graduated: onChain.graduated, _fetched: true };
      const card = container.querySelector(`[data-addr="${ft.address}"]`);
      if (card) {
        const tmp = document.createElement('div');
        tmp.innerHTML = buildCardHtml(token);
        const newCard = tmp.firstElementChild;
        card.replaceWith(newCard);
        newCard.addEventListener('click', () => this.router.navigate('/token/' + ft.address));
      }
    }
  }

  updateStats() {
    const c = window.tokenRegistry.getCount();
    const el = document.getElementById('statTokens');
    if (el) el.textContent = c;
  }

  async updateChainInfo() {
    try {
      const res = await fetch('https://robinhoodchain.blockscout.com/api/v2/stats');
      const data = await res.json();
      const blockEl = document.getElementById('chainBlock');
      if (blockEl && data.total_blocks) {
        blockEl.textContent = '#' + Number(data.total_blocks).toLocaleString();
      }
      const gasEl = document.getElementById('chainGas');
      if (gasEl && data.gas_prices) {
        const avg = data.gas_prices.average;
        const gwei = typeof avg === 'object' ? (Number(avg.wei) / 1e9).toFixed(4) : Number(avg).toFixed(2);
        gasEl.textContent = gwei + ' Gwei';
      }
    } catch (e) { /* silent */ }
  }

  async loadTokens(query = '', silent = false) {
    const grid = document.getElementById('tokenGrid');
    if (!grid) return;

    if (!silent) grid.innerHTML = Array(6).fill(`<div class="skeleton-card">
        <div class="sk-header"><div class="sk-badge"></div></div>
        <div class="sk-body">
          <div class="sk-line w60"></div>
          <div class="sk-line w40" style="height:12px"></div>
          <div class="sk-line h20 w80" style="margin-top:4px"></div>
          <div class="sk-line h4 w100" style="margin-top:6px"></div>
          <div class="sk-row"><div class="sk-line w40" style="height:11px"></div><div class="sk-line w40" style="height:11px"></div></div>
        </div>
      </div>`).join('');

    try {
      let tokens = await window.tokenRegistry.fetchLiveData();
      if (query) {
        const q = query.toLowerCase();
        tokens = tokens.filter(t => (t.name || '').toLowerCase().includes(q) || (t.symbol || '').toLowerCase().includes(q));
      }
      if (tokens.length === 0) {
        grid.innerHTML = query
          ? `<div class="empty-state empty-state--centered">
              <svg class="empty-state-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <div class="empty-state-body">
                <h3>No matching tokens</h3>
                <p>Try a different search term.</p>
                <button class="btn btn-outline" onclick="document.getElementById('exploreSearch').value='';document.getElementById('exploreSearch').dispatchEvent(new Event('input'))">Clear filters</button>
              </div>
            </div>`
          : `<div class="empty-state empty-state--centered">
              <div class="empty-state-illus">
                <img src="/assets/launcher-illus.png" alt="" class="empty-state-img" width="160" height="130">
              </div>
              <div class="empty-state-body">
                <h3>No community tokens yet</h3>
                <p>Be the first to launch a token on OWNLY. Turn your ideas into opportunities.</p>
                <a href="/create" class="btn btn-primary" data-link>+ Create Token</a>
              </div>
            </div>`;
        return;
      }
      const sort = this.currentSort || 'newest';
      if (sort === 'newest') tokens.sort((a, b) => new Date(b.launchedAt) - new Date(a.launchedAt));
      else if (sort === 'mcap') tokens.sort((a, b) => (b.marketCapUsd || 0) - (a.marketCapUsd || 0));
      else if (sort === 'recent') tokens.sort((a, b) => new Date(b.launchedAt) - new Date(a.launchedAt));
      else if (sort === 'name') tokens.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      this.renderGrid(grid, tokens);
      this.updateLiveStats(tokens);
    } catch (e) {
      console.error('loadTokens error:', e);
      grid.innerHTML = `<div class="empty-state empty-state--centered">
              <svg class="empty-state-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <div class="empty-state-body">
                <h3>Failed to load tokens</h3>
                <p>Check your connection and try again.</p>
                <button class="btn btn-outline" onclick="window.app.loadTokens()">Retry</button>
              </div>
            </div>`;
    }
  }

  updateLiveStats(tokens) {
    const el = document.getElementById('statTokens');
    if (el) el.textContent = tokens.length;
  }

  renderGrid(grid, tokens) {
    if (!tokens.length) {
      grid.innerHTML = `<div class="empty-state">
        <h3>No community tokens yet</h3>
        <p>Be the first to launch a token on Ownly.</p>
        <a href="/create" class="btn btn-primary" data-link>Create Token</a>
      </div>`;
      return;
    }
    grid.innerHTML = tokens.map((t, i) => {
      const progress = t.graduationProgressPct || 0;
      const initial = this.esc(t.symbol?.charAt(0) || '?');
      const logoSrc = this.fixLogoUrl(t.logo);
      const logoHtml = logoSrc ? `<img src="${logoSrc}" alt="${this.esc(t.symbol)}" style="width:100%;height:100%;object-fit:cover" onerror="this.replaceWith(document.createTextNode('${initial}'))">` : initial;
      const addr = t.token ? t.token.slice(0,6) + '...' + t.token.slice(-4) : '';
      const badgeHtml = t.graduated ? '<span class="token-card-badge badge-graduated">graduated</span>' : '';
      return `
        <div class="token-card" data-token="${t.token}" data-idx="${i}">
          <div class="token-card-header">
            ${badgeHtml}

            <div class="token-card-logo">${logoHtml}</div>
          </div>
          <div class="token-card-body">
            <div class="token-card-title-row">
              <div class="token-card-name">${this.esc(t.name)}</div>
              <div class="token-card-symbol">$${this.esc(t.symbol)}</div>
            </div>
            <div class="token-card-mcap">${this.fmtUSD(t.marketCapUsd)} <span class="token-card-mcap-label">MC</span></div>

            <div class="token-card-footer">
              <span>${addr}</span>
              <span>${this.timeAgo(t.launchedAt)}</span>
            </div>
          </div>
        </div>`;
    }).join('');

    grid.querySelectorAll('.token-card').forEach(card => {
      card.addEventListener('click', () => {
        window.app.router.navigate('/token/' + card.dataset.token);
      });
    });
  }

  // ---- TOKEN DETAIL PAGE ----
  async openToken(addr) {
    const sb = document.getElementById('searchBar');
    if (sb) sb.style.display = 'none';
    const ticker = document.getElementById('tickerBar');
    if (ticker) ticker.style.display = 'none';

    const tpl = document.getElementById('tpl-token').content.cloneNode(true);
    document.getElementById('app').replaceChildren(tpl);
    const container = document.getElementById('tokenDetailContent');

    const registry = window.tokenRegistry;
    const lc = addr.toLowerCase();
    let stored = registry.getAll().find(t => t.address?.toLowerCase() === lc);
    if (!stored) stored = FEATURED_TOKENS.find(t => t.address?.toLowerCase() === lc);

    if (!stored) {
      await Promise.race([registry._syncFromDb(), new Promise(r => setTimeout(r, 1500))]);
      stored = registry.getAll().find(t => t.address?.toLowerCase() === lc);
    }

    if (stored) {
      this.renderTokenPage(registry._offlineEntry({ ...stored, _ownly: true }), container);
      Promise.race([registry.fetchSingleToken(addr), new Promise(r => setTimeout(() => r(null), 2000))])
        .then(live => { if (live && window.location.pathname.includes(addr)) this.renderTokenPage(live, container); })
        .catch(() => {});
    } else {
      container.innerHTML = `<div class="td-loading">
        <img src="/assets/logo-sm.png" alt="OWNLY" class="td-loading-logo">
        <div class="td-loading-bar"><div class="td-loading-fill"></div></div>
        <p class="td-loading-text">Loading token data...</p>
      </div>`;
      try {
        const token = await Promise.race([registry.fetchSingleToken(addr), new Promise(r => setTimeout(() => r(null), 3000))]);
        if (token) this.renderTokenPage(token, container);
        else { container.innerHTML = '<div class="empty-state"><h3>Token not found</h3><p>This token is not in the OWNLY registry.</p><a href="/" class="btn btn-primary" data-link>Back to Explore</a></div>'; }
      } catch (e) {
        console.error('openToken error:', e);
        container.innerHTML = '<div class="empty-state"><h3>Failed to load</h3><p>Check your connection and try again.</p><a href="/" class="btn btn-primary" data-link>Back to Explore</a></div>';
      }
    }
  }

  renderTokenPage(token, container) {
    this.currentTradeToken = token;
    this.tradeMode = 'buy';
    const progress = token.graduationProgressPct || 0;
    const explorerUrl = window.ponsLinks.getExplorerUrl(token.token);
    const logoSrc = this.fixLogoUrl(token.logo);
    const logoHtml = logoSrc
      ? `<img src="${logoSrc}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display='none';this.parentElement.textContent='${this.esc(token.symbol?.charAt(0) || '?')}'">`
      : this.esc(token.symbol?.charAt(0) || '?');
    const priceEth = token.priceEth || 0;
    const tokensPerEth = priceEth > 0 ? Math.round(1 / priceEth) : 0;
    const shortContract = token.token ? token.token.slice(0,6) + '...' + token.token.slice(-4) : '--';
    const shortDeployer = token.deployer ? token.deployer.slice(0,6) + '...' + token.deployer.slice(-4) : '--';

    // Build agent info section

    container.innerHTML = `
      <!-- Back link -->
      <a href="/" class="td-back-link" data-link>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
        Back to explore
      </a>

      <!-- Token hero header -->
      <div class="td-hero-card">
        <div class="td-hero-left">
          <div class="td-hero-identity">
            <div class="td-hero-logo">${logoHtml}</div>
            <div class="td-hero-info">
              <div class="td-hero-name">
                ${this.esc(token.name)}
                <svg class="td-verified-badge" width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="var(--accent)"/><path d="M9 12l2 2 4-4" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
              <div class="td-hero-badges">
                <span class="td-hero-sym">${this.esc(token.symbol)}</span>
                <span class="td-paired-badge">${token.graduated ? 'Graduated' : 'Paired ETH'}</span>
              </div>
              <div class="td-hero-desc">${this.esc(token.description || 'No description provided.')}</div>
              <div class="td-hero-socials">
                ${token.twitter ? `<a href="${this.esc(token.twitter)}" target="_blank" rel="noopener" class="td-social-icon" title="X"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>` : ''}
                ${token.telegram ? `<a href="${this.esc(token.telegram)}" target="_blank" rel="noopener" class="td-social-icon" title="Telegram"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg></a>` : ''}
                ${token.website ? `<a href="${this.esc(token.website)}" target="_blank" rel="noopener" class="td-social-icon" title="Website"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></a>` : ''}
              </div>
            </div>
          </div>
        </div>
        <div class="td-hero-right">
          <div class="td-hero-chain">
            <img src="/assets/robinhood-chain.png" alt="Robinhood Chain" style="width:18px;height:18px;border-radius:50%;object-fit:cover;">
            Robinhood Chain
          </div>
          <div class="td-hero-details">
            <div class="td-hero-detail-row">
              <span class="td-detail-label">Total Supply</span>
              <span class="td-detail-value td-detail-lg">1,000,000,000 <span class="td-detail-sym">${this.esc(token.symbol)}</span></span>
            </div>
            <div class="td-hero-detail-row">
              <span class="td-detail-label">Creator</span>
              <span class="td-detail-value">
                ${shortDeployer}
                <button class="td-copy-inline" data-copy="${this.esc(token.deployer || '')}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <span class="td-detail-sub">${((token.creatorTaxBps || 0) / 100).toFixed(2)}% creator tax</span>
              </span>
            </div>
            <div class="td-hero-detail-row">
              <span class="td-detail-label">Contract Address</span>
              <span class="td-detail-value">
                ${shortContract}
                <button class="td-copy-inline" id="btnCopyContract">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <a href="${explorerUrl}" target="_blank" rel="noopener" class="td-view-explorer-btn">
                  View on Explorer
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Creator fees card -->
      <div class="td-fees-card">
        <div class="td-fees-icon">
          <img src="/assets/dollar-icon.png" alt="" draggable="false" oncontextmenu="return false" style="width:100%;height:100%;object-fit:contain;pointer-events:none;">
        </div>
        <div class="td-fees-left">
          <div class="td-fees-title">Creator Fees</div>
          <div class="td-fees-body">
            ${this.esc(token.symbol)} pays its creator fees to ${shortDeployer}. The creator can route them to holders instead, split pro-rata for each holder to claim from their profile menu.
          </div>
        </div>
        <div class="td-fees-right">
          <div class="td-fees-note">Only the fee recipient wallet can switch this on.</div>
          <a href="${window.ponsLinks.getTokenUrl(token.token)}" target="_blank" rel="noopener" class="td-pons-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
            Pons Family
          </a>
        </div>
      </div>

      <!-- Two-column: trade left, chart right -->
      <div class="td-main-grid">
        <!-- Left: token card with identity + curve + trade -->
        <div class="td-token-card">
          <div class="td-token-identity">
            <div class="td-logo">${logoHtml}</div>
            <div class="td-token-meta">
              <div class="td-token-name">${this.esc(token.name)}</div>
              <div class="td-token-badges">
                <span class="td-token-sym">${this.esc(token.symbol)}</span>
                <span class="td-paired-badge" style="font-size:11px;padding:2px 8px">${token.graduated ? 'Graduated' : 'Paired ETH'}</span>
              </div>
            </div>
          </div>

          <div class="td-curve-section">
            <div class="td-curve-header">
              <span class="td-curve-label">Bonding Curve <span class="td-curve-info" title="At the graduation threshold the curve closes and liquidity moves to a Uniswap v4 pool."><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></span></span>
              <span class="td-curve-pct">${progress.toFixed(1)}% to graduation</span>
            </div>
            <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100, progress)}%"></div></div>
            <div class="td-curve-detail">${this.fmtETH(token.raisedEth)} of ${this.fmtETH(token.graduationEth || 4.2)} ETH raised</div>
          </div>

          <div class="td-trade-area">
            <div class="trade-tabs">
              <button class="btn btn-primary trade-tab active" data-mode="buy" style="flex:1;border-radius:8px 0 0 8px">Buy</button>
              <button class="btn btn-outline trade-tab" data-mode="sell" style="flex:1;border-radius:0 8px 8px 0;border-left:0">Sell</button>
            </div>

            <div id="tradeForm">
              <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px">
                <span style="color:var(--text-2)" id="tradeInputLabel">Pay ETH:</span>
                <span style="color:var(--text-3)" id="tradeBalance">Balance: --</span>
              </div>
              <input type="number" id="tradeAmount" placeholder="0" step="any" min="0" class="form-input" style="width:100%;margin-bottom:6px;padding:10px 12px;font-size:14px">
              <div style="display:flex;gap:5px;margin-bottom:10px">
                <button class="btn btn-outline btn-sm quick-amt" data-amt="0.01" style="font-size:11px;padding:4px 0;flex:1">0.01</button>
                <button class="btn btn-outline btn-sm quick-amt" data-amt="0.05" style="font-size:11px;padding:4px 0;flex:1">0.05</button>
                <button class="btn btn-outline btn-sm quick-amt" data-amt="0.1" style="font-size:11px;padding:4px 0;flex:1">0.1</button>
                <button class="btn btn-outline btn-sm quick-amt" data-amt="0.5" style="font-size:11px;padding:4px 0;flex:1">0.5</button>
                <button class="btn btn-outline btn-sm quick-amt" data-amt="1" style="font-size:11px;padding:4px 0;flex:1">1</button>
              </div>

              <div class="td-conversion" id="tradeConversion">1 ETH ~ ${tokensPerEth > 0 ? this.fmt(tokensPerEth) : '--'} ${this.esc(token.symbol)}</div>
              <div id="tradeEstimate" style="font-size:12px;color:var(--text-3);margin-bottom:10px"></div>

              <div style="font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px">Slippage</div>
              <div style="display:flex;gap:5px;align-items:center;margin-bottom:12px">
                <button class="btn btn-outline btn-sm slip-btn" data-slip="100" style="font-size:11px;padding:4px 10px">1%</button>
                <button class="btn btn-primary btn-sm slip-btn active" data-slip="200" style="font-size:11px;padding:4px 10px">2%</button>
                <button class="btn btn-outline btn-sm slip-btn" data-slip="500" style="font-size:11px;padding:4px 10px">5%</button>
                <div class="td-slip-custom">
                  <input type="number" id="customSlippage" placeholder="Custom" min="0.1" max="50" step="0.1" class="td-slip-input">
                  <span class="td-slip-pct">%</span>
                </div>
              </div>

              <button class="btn btn-primary btn-lg btn-full" id="tradeExec" style="font-weight:600;border-radius:8px;padding:10px;font-size:14px">
                ${window.walletManager.connected ? 'Buy ' + this.esc(token.symbol) : 'Connect Wallet to Trade'}
              </button>
            </div>
          </div>
        </div>

        <!-- Right: stats + chart -->
        <div class="td-chart-col">
          <div class="td-stats-row">
            <div class="td-stat-card"><div class="label">Price</div><div class="val">${this.fmtPrice(token.priceUsd)}</div></div>
            <div class="td-stat-card"><div class="label">Market Cap</div><div class="val">${this.fmtUSD(token.marketCapUsd)}</div></div>
            <div class="td-stat-card"><div class="label">Price in ETH</div><div class="val">${priceEth > 0 ? this.fmtETH(priceEth) : '0'} ETH</div></div>
            <div class="td-stat-card"><div class="label">Model</div><div class="val">${token.graduated ? 'Uniswap' : 'Bonding curve'}</div></div>
          </div>
          <div class="td-chart-area">
            <div class="td-chart-top">
              <div>
                <div class="td-chart-title">${this.esc(token.symbol)} Price</div>
                <div class="td-chart-mcap">${this.fmtUSD(token.marketCapUsd)}</div>
                <div class="td-chart-change green">+40.78% ↗</div>
              </div>
              <div class="td-chart-ranges" id="chartRanges">
                <button class="td-range-btn" data-range="300000">5M</button>
                <button class="td-range-btn active" data-range="3600000">1H</button>
                <button class="td-range-btn" data-range="21600000">6H</button>
                <button class="td-range-btn" data-range="86400000">1D</button>
                <button class="td-range-btn" data-range="0">ALL</button>
              </div>
            </div>
            <div class="td-chart-wrap">
              <div id="chartLoading" style="position:absolute;inset:0;display:flex;flex-direction:column;gap:8px;padding:16px">
                <div class="sk-line w100" style="flex:1;border-radius:6px"></div>
                <div class="sk-row" style="gap:12px"><div class="sk-line w40" style="height:10px"></div><div class="sk-line w40" style="height:10px"></div><div class="sk-line w40" style="height:10px"></div></div>
              </div>
              <canvas id="priceChart"></canvas>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent trades section -->
      <div class="td-trades-card">
        <div class="td-trades-tabs">
          <button class="td-trades-tab active" data-panel="trades">Recent trades</button>
          <button class="td-trades-tab" data-panel="holders">Holders</button>
        </div>
        <div class="td-trades-content" id="tdTradesContent">
          <div class="td-trades-empty">Loading trades...</div>
        </div>
      </div>
    `;

    // Copy buttons
    document.getElementById('btnCopyContract')?.addEventListener('click', () => {
      navigator.clipboard.writeText(token.token).then(() => showToast('Contract address copied!', 'success')).catch(() => showToast('Failed to copy.', 'error'));
    });
    container.querySelectorAll('.td-copy-inline[data-copy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.copy;
        if (val) navigator.clipboard.writeText(val).then(() => showToast('Copied!', 'success')).catch(() => {});
      });
    });

    // Bottom trades/holders tab switching
    const tradesTabs = container.querySelectorAll('.td-trades-tab');
    const tradesContent = document.getElementById('tdTradesContent');

    tradesTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tradesTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        if (tab.dataset.panel === 'holders') {
          this.loadHolders(token);
        } else {
          this.loadRecentTrades(token);
        }
      });
    });

    // Trade tabs
    container.querySelectorAll('.trade-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        container.querySelectorAll('.trade-tab').forEach(t => { t.classList.remove('active'); t.classList.remove('btn-primary'); t.classList.remove('btn-sell'); t.classList.add('btn-outline'); });
        tab.classList.add('active'); tab.classList.remove('btn-outline');
        tab.classList.add(tab.dataset.mode === 'sell' ? 'btn-sell' : 'btn-primary');
        this.tradeMode = tab.dataset.mode;
        this.updateTradeUI(token);
      });
    });

    // Quick amounts
    container.querySelectorAll('.quick-amt').forEach(btn => {
      btn.addEventListener('click', () => { document.getElementById('tradeAmount').value = btn.dataset.amt; this.updateEstimate(token); });
    });

    // Slippage
    container.querySelectorAll('.slip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.slip-btn').forEach(b => { b.classList.remove('active'); b.classList.remove('btn-primary'); b.classList.add('btn-outline'); });
        btn.classList.add('active'); btn.classList.remove('btn-outline'); btn.classList.add('btn-primary');
        this.slippageBps = parseInt(btn.dataset.slip);
        const ci = container.querySelector('#customSlippage');
        if (ci) ci.value = '';
      });
    });
    const customSlip = container.querySelector('#customSlippage');
    if (customSlip) {
      customSlip.addEventListener('input', () => {
        const val = parseFloat(customSlip.value);
        if (val > 0 && val <= 50) {
          container.querySelectorAll('.slip-btn').forEach(b => { b.classList.remove('active'); b.classList.remove('btn-primary'); b.classList.add('btn-outline'); });
          this.slippageBps = Math.round(val * 100);
        }
      });
    }

    // Chart range buttons
    container.querySelectorAll('.td-range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.td-range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Estimate on input
    document.getElementById('tradeAmount').addEventListener('input', () => this.updateEstimate(token));

    // Execute trade
    document.getElementById('tradeExec').addEventListener('click', () => this.executeTrade(token));

    this.updateTradeUI(token);
    this.loadPriceChart(token);
    this.loadRecentTrades(token);

    if (this._tradesInterval) clearInterval(this._tradesInterval);
    this._tradesInterval = setInterval(async () => {
      if (window.location.pathname.startsWith('/token/')) {
        this._curveEventsCache = null;
        window.tokenRegistry._onChainCache.delete((token.token || '').toLowerCase());
        const activeTab = document.querySelector('.td-trades-tab.active');
        if (activeTab?.dataset.panel === 'holders') {
          this.loadHolders(token);
        } else {
          this.loadRecentTrades(token);
        }
        const [events, liveToken] = await Promise.all([
          token.curve ? this._fetchCurveEvents(token.curve, 5) : [],
          window.tokenRegistry.fetchSingleToken(token.token)
        ]);
        this._chartAllEvents = events.slice().sort((a, b) => (a.ts || a.block) - (b.ts || b.block));
        if (liveToken) {
          Object.assign(token, liveToken);
          this.currentTradeToken = token;
          this._updateStatCards(token);
        }
        this._renderChart();
      } else {
        clearInterval(this._tradesInterval);
      }
    }, 10000);
  }

  _parseCurveLog(log, buyTopic, sellTopic, tsField, txField, blockParse) {
    const topic0 = log.topics?.[0];
    const block = blockParse ? blockParse(log) : log.block_number;
    const ts = log[tsField] ? new Date(log[tsField]).getTime() : 0;
    const tx = log[txField] || '';
    if (topic0 === buyTopic) {
      const d = ethers.AbiCoder.defaultAbiCoder().decode(['uint256','uint256','uint256','uint256'], log.data);
      const qIn = Number(ethers.formatEther(d[0]));
      const tOut = Number(ethers.formatEther(d[1]));
      return { block, ts, type: 'buy', addr: '0x' + log.topics[1].slice(26), amount: tOut, eth: qIn, usd: qIn * ETH_PRICE_USD, price: tOut > 0 ? qIn / tOut : 0, txHash: tx };
    }
    if (topic0 === sellTopic) {
      const d = ethers.AbiCoder.defaultAbiCoder().decode(['uint256','uint256','uint256','uint256'], log.data);
      const tIn = Number(ethers.formatEther(d[0]));
      const qOut = Number(ethers.formatEther(d[1]));
      return { block, ts, type: 'sell', addr: '0x' + log.topics[1].slice(26), amount: tIn, eth: qOut, usd: qOut * ETH_PRICE_USD, price: tIn > 0 ? qOut / tIn : 0, txHash: tx };
    }
    return null;
  }

  async _fetchCurveEvents(curve, maxPages = 3) {
    const cacheKey = curve.toLowerCase();
    if (this._curveEventsCache?.key === cacheKey && Date.now() - this._curveEventsCache.ts < 30000) {
      return this._curveEventsCache.data;
    }
    const buyTopic = ethers.id('CurveBuy(address,address,uint256,uint256,uint256,uint256)');
    const sellTopic = ethers.id('CurveSell(address,address,uint256,uint256,uint256,uint256)');
    const events = [];
    try {
      let url = `${CONTRACTS.EXPLORER}/api/v2/addresses/${curve}/logs`;
      for (let page = 0; page < maxPages; page++) {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('API ' + resp.status);
        const data = await resp.json();
        for (const log of (data.items || [])) {
          const ev = this._parseCurveLog(log, buyTopic, sellTopic, 'block_timestamp', 'transaction_hash');
          if (ev) events.push(ev);
        }
        if (!data.next_page_params) break;
        const p = data.next_page_params;
        url = `${CONTRACTS.EXPLORER}/api/v2/addresses/${curve}/logs?index=${p.index}&block_number=${p.block_number}&items_count=${p.items_count}`;
      }
    } catch (e) {
      console.warn('fetchCurveEvents v2 failed, trying v1:', e);
      if (!events.length) {
        try {
          const v1url = `${CONTRACTS.EXPLORER}/api?module=logs&action=getLogs&address=${curve}&fromBlock=0&toBlock=latest`;
          const d = await this._fetchWithRetry(v1url);
          if (d?.status === '1' && d.result) {
            for (const log of d.result) {
              const ev = this._parseCurveLog(log, buyTopic, sellTopic, 'timeStamp', 'transactionHash', (l) => parseInt(l.blockNumber, 16));
              if (ev) events.push(ev);
            }
          }
        } catch {}
      }
    }
    this._curveEventsCache = { key: cacheKey, data: events, ts: Date.now() };
    return events;
  }

  async loadRecentTrades(token) {
    const content = document.getElementById('tdTradesContent');
    if (!content || !token.curve) return;

    try {
      const events = (await this._fetchCurveEvents(token.curve)).slice().sort((a, b) => b.block - a.block);

      if (!events.length) {
        content.innerHTML = '<div class="td-trades-empty">No trades yet</div>';
        return;
      }

      const shortAddr = (a) => a ? a.slice(0,6) + '...' + a.slice(-4) : '';
      const explorer = CONTRACTS.EXPLORER;
      const timeAgo = (ts) => {
        if (!ts) return '';
        const diff = Math.floor((Date.now() - ts) / 1000);
        if (diff < 60) return diff + 's ago';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        return Math.floor(diff / 86400) + 'd ago';
      };
      content.innerHTML = `
        <div class="td-trades-header">
          <span>Type</span>
          <span>Amount</span>
          <span>ETH</span>
          <span>USD</span>
          <span>Maker</span>
          <span>Tx</span>
          <span>Time</span>
        </div>
        <ul class="td-trades-list">${events.slice(0, 20).map(ev => `
          <li class="td-trade-row">
            <span class="td-trade-type ${ev.type}"><span class="dot"></span>${ev.type === 'buy' ? 'Buy' : 'Sell'}</span>
            <span class="td-trade-tokens">${this.fmtTokens(ev.amount)} ${this.esc(token.symbol)}</span>
            <span class="td-trade-eth">${ev.eth < 0.0001 ? ev.eth.toFixed(8) : ev.eth.toFixed(4)}</span>
            <span class="td-trade-usd">$${ev.usd < 0.01 ? ev.usd.toFixed(4) : ev.usd.toFixed(2)}</span>
            <a class="td-trade-addr" href="${explorer}/address/${ev.addr}" target="_blank" rel="noopener">${shortAddr(ev.addr)}</a>
            <a class="td-trade-tx" href="${explorer}/tx/${ev.txHash}" target="_blank" rel="noopener">${ev.txHash ? ev.txHash.slice(0,6) + '...' + ev.txHash.slice(-4) : ''}<svg width="10" height="10" viewBox="0 0 12 12" fill="none" style="margin-left:4px;vertical-align:middle;opacity:0.6"><path d="M4.5 1.5H2.5C1.95 1.5 1.5 1.95 1.5 2.5v7c0 .55.45 1 1 1h7c.55 0 1-.45 1-1V7.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M7 1.5h3.5V5M7 5.5l3.5-3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
            <span class="td-trade-time">${timeAgo(ev.ts)}</span>
          </li>`).join('')}</ul>`;
    } catch (e) {
      console.warn('loadRecentTrades error:', e);
      content.innerHTML = '<div class="td-trades-empty">No trades yet</div>';
    }
  }

  async loadHolders(token) {
    const content = document.getElementById('tdTradesContent');
    if (!content || !token.token) return;
    content.innerHTML = '<div class="td-trades-empty">Loading holders...</div>';

    try {
      const url = `${CONTRACTS.EXPLORER}/api/v2/tokens/${token.token}/holders`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('API ' + resp.status);
      const data = await resp.json();
      const holders = data.items || [];

      if (!holders.length) {
        content.innerHTML = '<div class="td-trades-empty">No holder data available</div>';
        return;
      }

      const totalSupply = BigInt(CONTRACTS.TOKEN_SUPPLY) * 10n ** 18n;
      const deployer = (token.deployer || '').toLowerCase();
      const curve = (token.curve || '').toLowerCase();
      const shortAddr = (a) => a ? a.slice(0, 6) + '...' + a.slice(-4) : '';
      const explorer = CONTRACTS.EXPLORER;
      const linkIcon = '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" style="margin-left:4px;vertical-align:middle;opacity:0.6"><path d="M4.5 1.5H2.5C1.95 1.5 1.5 1.95 1.5 2.5v7c0 .55.45 1 1 1h7c.55 0 1-.45 1-1V7.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M7 1.5h3.5V5M7 5.5l3.5-3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

      holders.sort((a, b) => {
        const aVal = BigInt(a.value || '0');
        const bVal = BigInt(b.value || '0');
        if (bVal > aVal) return 1;
        if (bVal < aVal) return -1;
        return 0;
      });

      const rows = holders.map((h, i) => {
        const addr = h.address?.hash || '';
        const addrLc = addr.toLowerCase();
        const raw = BigInt(h.value || '0');
        const balance = Number(raw) / 1e18;
        const pct = totalSupply > 0n ? Number(raw * 10000n / totalSupply) / 100 : 0;
        let tag = '';
        if (addrLc === deployer) tag = '<span class="holder-tag dev">Dev</span>';
        else if (addrLc === curve) tag = '<span class="holder-tag contract">Bonding Curve</span>';
        else if (h.address?.is_contract) tag = '<span class="holder-tag contract">Contract</span>';

        return `<li class="td-holder-row">
          <span class="td-holder-rank">${i + 1}</span>
          <a class="td-holder-addr" href="${explorer}/address/${addr}" target="_blank" rel="noopener">${shortAddr(addr)}${linkIcon}</a>
          <span class="td-holder-tag-cell">${tag}</span>
          <span class="td-holder-balance">${this.fmtTokens(balance)}</span>
          <span class="td-holder-pct-cell">
            <span class="td-holder-pct">${pct.toFixed(2)}%</span>
            <div class="td-holder-bar"><div class="td-holder-bar-fill" style="width:${Math.min(pct, 100)}%"></div></div>
          </span>
        </li>`;
      });

      content.innerHTML = `
        <div class="td-holders-header">
          <span>#</span>
          <span>Address</span>
          <span>Type</span>
          <span>Balance</span>
          <span>Share</span>
        </div>
        <ul class="td-trades-list">${rows.join('')}</ul>`;
    } catch (e) {
      console.warn('loadHolders error:', e);
      content.innerHTML = '<div class="td-trades-empty">Failed to load holders</div>';
    }
  }

  async _fetchWithRetry(url, retries = 3, delay = 1500) {
    for (let i = 0; i < retries; i++) {
      try {
        const resp = await fetch(url);
        if (resp.status === 429) {
          await new Promise(r => setTimeout(r, delay * (i + 1)));
          continue;
        }
        return await resp.json();
      } catch {
        if (i < retries - 1) await new Promise(r => setTimeout(r, delay * (i + 1)));
      }
    }
    return null;
  }

  async loadPriceChart(token) {
    const canvas = document.getElementById('priceChart');
    const loading = document.getElementById('chartLoading');
    if (!canvas) return;

    const events = token.curve ? await this._fetchCurveEvents(token.curve, 5) : [];
    if (loading) loading.style.display = 'none';

    this._chartAllEvents = events.slice().sort((a, b) => (a.ts || a.block) - (b.ts || b.block));
    this._chartToken = token;
    this._chartRange = 3600000;

    const rangeContainer = document.getElementById('chartRanges');
    if (rangeContainer) {
      rangeContainer.querySelectorAll('.td-range-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          rangeContainer.querySelectorAll('.td-range-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this._chartRange = parseInt(btn.dataset.range);
          this._renderChart();
        });
      });
    }

    this._renderChart();
  }

  _updateStatCards(token) {
    const priceEth = token.priceEth || 0;
    const cards = document.querySelectorAll('.td-stat-card');
    if (cards[0]) cards[0].querySelector('.val').innerHTML = this.fmtPrice(token.priceUsd);
    if (cards[1]) cards[1].querySelector('.val').innerHTML = this.fmtUSD(token.marketCapUsd);
    if (cards[2]) cards[2].querySelector('.val').innerHTML = (priceEth > 0 ? this.fmtETH(priceEth) : '0') + ' ETH';
    const mcapEl = document.querySelector('.td-chart-mcap');
    if (mcapEl) mcapEl.textContent = this.fmtUSD(token.marketCapUsd);
  }

  _renderChart() {
    const canvas = document.getElementById('priceChart');
    if (!canvas) return;
    const token = this._chartToken;
    const allEvents = this._chartAllEvents || [];
    const rangeMs = this._chartRange;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const ctx = canvas.getContext('2d');
    const fmtMcap = (v) => v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`;

    let filtered = allEvents.filter(e => e.price > 0);
    if (rangeMs > 0 && filtered.length && filtered[0].ts) {
      const cutoff = Date.now() - rangeMs;
      const ranged = filtered.filter(e => e.ts >= cutoff);
      if (ranged.length > 0) filtered = ranged;
    }

    let mcaps, labels, pctChange;
    if (filtered.length >= 2) {
      mcaps = filtered.map(e => e.price * ETH_PRICE_USD * CONTRACTS.TOKEN_SUPPLY);
      labels = filtered.map(e => {
        if (!e.ts) return '';
        const d = new Date(e.ts);
        return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
      });
      const first = mcaps[0], last = mcaps[mcaps.length - 1];
      pctChange = first > 0 ? ((last - first) / first) * 100 : 0;
    } else {
      const currentMcap = (token.priceEth || 0) * ETH_PRICE_USD * CONTRACTS.TOKEN_SUPPLY || 4370;
      mcaps = [currentMcap, currentMcap];
      labels = ['', ''];
      pctChange = 0;
    }

    const changeEl = document.querySelector('.td-chart-change');
    if (changeEl) {
      const sign = pctChange >= 0 ? '+' : '';
      const rangeLabel = this._chartRange === 0 ? 'ALL' : this._chartRange <= 300000 ? '5M' : this._chartRange <= 3600000 ? '1H' : this._chartRange <= 21600000 ? '6H' : '1D';
      const color = pctChange >= 0 ? 'var(--green)' : 'var(--red)';
      changeEl.innerHTML = `<span style="color:${color}">${sign}${pctChange.toFixed(2)}%</span> <span style="color:var(--text-3)">${rangeLabel}</span>`;
    }

    const isUp = pctChange >= 0;
    const lineColor = isUp ? (isDark ? '#22c55e' : '#16a34a') : (isDark ? '#ef4444' : '#dc2626');

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.parentElement?.offsetHeight || 220);
    gradient.addColorStop(0, isUp ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)');
    gradient.addColorStop(0.7, isUp ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    const lastMcap = mcaps[mcaps.length - 1];
    const priceAnnotation = {
      id: 'priceAnnotation',
      afterDraw(chart) {
        const yScale = chart.scales.y;
        const xScale = chart.scales.x;
        if (!yScale || !xScale) return;
        const y = yScale.getPixelForValue(lastMcap);
        const c = chart.ctx;
        c.save(); c.setLineDash([4, 4]); c.strokeStyle = lineColor + '66'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(xScale.left, y); c.lineTo(xScale.right, y); c.stroke(); c.restore();
        c.save(); c.font = "10px 'JetBrains Mono', monospace"; c.fillStyle = lineColor + 'cc';
        c.textAlign = 'right'; c.fillText(fmtMcap(lastMcap), xScale.right, y - 4); c.restore();
      }
    };

    const pointRadii = mcaps.map((_, i) => i === mcaps.length - 1 ? 4 : 0);

    if (this._chart) this._chart.destroy();
    this._chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: mcaps,
          borderColor: lineColor,
          backgroundColor: gradient,
          borderWidth: 2,
          pointRadius: pointRadii,
          pointHoverRadius: 5,
          pointBackgroundColor: lineColor,
          pointBorderColor: lineColor,
          fill: true,
          tension: 0.3
        }]
      },
      plugins: [priceAnnotation],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isDark ? '#1a1d28' : '#fff',
            titleColor: isDark ? '#f1f3f7' : '#111827',
            bodyColor: isDark ? '#a0a8b8' : '#4b5563',
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
            borderWidth: 1, padding: 10, displayColors: false,
            callbacks: {
              title: () => 'Market Cap',
              label: (item) => fmtMcap(item.raw)
            }
          }
        },
        scales: {
          x: {
            display: true,
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)',
              font: { size: 9, family: "'JetBrains Mono', monospace" },
              maxTicksLimit: 5,
              padding: 4
            }
          },
          y: {
            display: true,
            position: 'right',
            beginAtZero: false,
            suggestedMin: Math.min(...mcaps) * 0.95,
            grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', drawBorder: false, borderDash: [4, 4] },
            border: { display: false },
            ticks: {
              color: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)',
              font: { size: 9, family: "'JetBrains Mono', monospace" },
              callback: (v) => fmtMcap(v),
              maxTicksLimit: 5,
              padding: 8
            }
          }
        }
      }
    });
  }

  updateTradeUI(token) {
    const label = document.getElementById('tradeInputLabel');
    const balance = document.getElementById('tradeBalance');
    const exec = document.getElementById('tradeExec');
    const estimate = document.getElementById('tradeEstimate');
    const amtInput = document.getElementById('tradeAmount');
    const quickBtns = document.querySelectorAll('.quick-amt');

    exec.classList.remove('btn-sell');
    exec.classList.remove('btn-primary');
    if (this.tradeMode === 'buy') {
      label.textContent = 'Pay ETH:';
      amtInput.placeholder = '0.05';
      amtInput.value = '';
      const buyAmts = ['0.01', '0.05', '0.1', '0.5', '1'];
      quickBtns.forEach((b, i) => { b.dataset.amt = buyAmts[i] || '1'; b.textContent = buyAmts[i] || '1'; b.style.display = ''; });
      exec.classList.add('btn-primary');
      if (window.walletManager.connected) {
        window.walletManager.getBalance().then(b => { balance.textContent = 'Balance: ' + parseFloat(b).toFixed(4) + ' ETH'; });
        exec.textContent = 'Buy ' + token.symbol;
      } else {
        balance.textContent = 'Balance: -- ETH';
        exec.textContent = 'Connect Wallet to Trade';
      }
    } else {
      label.textContent = 'Sell ' + token.symbol + ':';
      amtInput.placeholder = 'Token amount';
      amtInput.value = '';
      quickBtns[0].dataset.amt = '25'; quickBtns[0].textContent = '25%';
      quickBtns[1].dataset.amt = '50'; quickBtns[1].textContent = '50%';
      quickBtns[2].dataset.amt = '100'; quickBtns[2].textContent = '100%';
      if (quickBtns[3]) quickBtns[3].style.display = 'none';
      if (quickBtns[4]) quickBtns[4].style.display = 'none';
      exec.classList.add('btn-sell');
      if (window.walletManager.connected && token.token) {
        window.walletManager.getTokenBalance(token.token).then(b => {
          const formatted = ethers.formatEther(b);
          balance.textContent = 'Balance: ' + this.fmtTokens(b) + ' ' + token.symbol;
          balance.dataset.raw = formatted;
          quickBtns.forEach(btn => {
            btn.addEventListener('click', () => {
              const pct = parseInt(btn.dataset.amt);
              const val = parseFloat(formatted) * pct / 100;
              amtInput.value = val.toString();
              this.updateEstimate(token);
            });
          });
        });
        exec.textContent = 'Sell ' + token.symbol;
      } else {
        balance.textContent = 'Balance: -- ' + token.symbol;
        exec.textContent = 'Connect Wallet to Trade';
      }
    }
    estimate.textContent = '';
  }

  async updateEstimate(token) {
    const amt = parseFloat(document.getElementById('tradeAmount').value);
    const estimate = document.getElementById('tradeEstimate');
    if (!amt || amt <= 0 || !token.curve) { estimate.innerHTML = ''; return; }

    try {
      if (this.tradeMode === 'buy') {
        const quoteIn = ethers.parseEther(amt.toString());
        const result = await window.contractManager.getBuyQuote(token.curve, quoteIn, window.walletManager.address || CONTRACTS.ZERO);
        const feeEth = parseFloat(ethers.formatEther(result.fee)).toFixed(6);
        const taxEth = parseFloat(ethers.formatEther(result.tax)).toFixed(6);
        estimate.innerHTML = `<div class="trade-estimate-box">
          <div class="est-label">You receive</div>
          <div class="est-value">${this.fmtTokens(result.tokensOut)} ${this.esc(token.symbol)}</div>
        </div>`;
      } else {
        const tokensIn = ethers.parseEther(amt.toString());
        const result = await window.contractManager.getSellQuote(token.curve, tokensIn);
        estimate.innerHTML = `<div class="trade-estimate-box">
          <div class="est-label">You receive</div>
          <div class="est-value">${this.fmtETH(parseFloat(ethers.formatEther(result.quoteOut)))} ETH</div>
        </div>`;
      }
    } catch (e) {
      estimate.innerHTML = '<span style="color:var(--text-3);font-size:12px">Error calculating quote</span>';
      console.error('Quote error:', e);
    }
  }

  async executeTrade(token) {
    if (!window.walletManager.connected) {
      await window.walletManager.connect();
      this.updateTradeUI(token);
      return;
    }

    if (!window.walletManager.signer) {
      await window.walletManager.ensureProvider();
    }
    if (!window.walletManager.signer) {
      window.walletManager.disconnect();
      window.walletManager.connect();
      return;
    }

    const amt = parseFloat(document.getElementById('tradeAmount').value);
    if (!amt || amt <= 0) { showToast('Enter an amount.', 'error'); return; }
    if (!token.curve) { showToast('Curve address not found.', 'error'); return; }

    const btn = document.getElementById('tradeExec');
    btn.disabled = true;

    try {
      await window.contractManager.switchToRobinhood();
      await window.contractManager.init(window.walletManager.provider, window.walletManager.signer);
      const recipient = await window.walletManager.signer.getAddress();

      if (this.tradeMode === 'buy') {
        btn.innerHTML = '<span class="spinner"></span> Getting quote...';
        const quoteIn = ethers.parseEther(amt.toString());
        const quote = await window.contractManager.getBuyQuote(token.curve, quoteIn, recipient);
        const minOut = quote.tokensOut * BigInt(10000 - this.slippageBps) / 10000n;

        btn.innerHTML = '<span class="spinner"></span> Confirm in wallet...';
        const receipt = await window.contractManager.buyToken(token.curve, quoteIn, minOut, recipient);
        showToast(`Bought ${this.fmtTokens(quote.tokensOut)} ${token.symbol}!`, 'success');
      } else {
        btn.innerHTML = '<span class="spinner"></span> Getting quote...';
        const tokensIn = ethers.parseEther(amt.toString());
        const quote = await window.contractManager.getSellQuote(token.curve, tokensIn);
        const minOut = quote.quoteOut * BigInt(10000 - this.slippageBps) / 10000n;

        btn.innerHTML = '<span class="spinner"></span> Approve token...';
        const receipt = await window.contractManager.sellToken(token.token, token.curve, tokensIn, minOut, recipient);
        showToast(`Sold for ${this.fmtETH(parseFloat(ethers.formatEther(quote.quoteOut)))} ETH!`, 'success');
      }

      this.updateTradeUI(token);
    } catch (err) {
      console.error('Trade error:', err);
      if (err.code === 'ACTION_REJECTED' || err.code === 4001) showToast('Transaction rejected.', 'error');
      else showToast('Trade failed: ' + (err.reason || err.shortMessage || err.message || 'Unknown error'), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = (this.tradeMode === 'buy' ? 'Buy ' : 'Sell ') + token.symbol;
    }
  }

  // ---- CREATE / DEPLOY ----
  renderCreate() {
    const sb = document.getElementById('searchBar');
    if (sb) sb.style.display = 'none';
    const tb = document.getElementById('tickerBar');
    if (tb) tb.style.display = 'none';

    const tpl = document.getElementById('tpl-create').content.cloneNode(true);
    document.getElementById('app').replaceChildren(tpl);

    document.querySelectorAll('#createNetworkName, #createNetworkName2').forEach(el => {
      el.textContent = CONTRACTS.CHAIN_NAME;
    });

    const form = document.getElementById('createForm');
    const nameInput = document.getElementById('tokenName');
    const symbolInput = document.getElementById('tokenSymbol');
    const descInput = document.getElementById('tokenDesc');
    const logoInput = document.getElementById('tokenLogo');
    const logoPreview = document.getElementById('logoPreview');
    const uploadPreview = document.getElementById('uploadPreview');
    const uploadPlaceholder = document.getElementById('uploadPlaceholder');
    const btnChoose = document.getElementById('btnChooseImage');
    const btnReplace = document.getElementById('btnReplace');
    const btnRemove = document.getElementById('btnRemove');
    const initialBuyInput = document.getElementById('initialBuy');
    let logoDataUrl = null;

    const showUploadedImage = (dataUrl) => {
      logoDataUrl = dataUrl;
      logoPreview.src = dataUrl;
      uploadPreview.hidden = false;
      uploadPlaceholder.hidden = true;
      document.getElementById('previewLogo').innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    };

    const clearUploadedImage = () => {
      logoDataUrl = null;
      logoInput.value = '';
      uploadPreview.hidden = true;
      uploadPlaceholder.hidden = false;
      document.getElementById('previewLogo').innerHTML = `<img src="/assets/logo.png" alt="OWNLY" style="width:100%;height:100%;object-fit:contain;border-radius:50%;padding:8px">`;
    };

    nameInput.addEventListener('input', () => {
      document.getElementById('previewName').textContent = nameInput.value || 'Your Token';
    });
    symbolInput.addEventListener('input', () => {
      symbolInput.value = symbolInput.value.toUpperCase();
      document.getElementById('previewSymbol').textContent = '$' + (symbolInput.value || 'TICKER');
    });
    descInput.addEventListener('input', () => {
      document.getElementById('descCount').textContent = descInput.value.length;
      const pd = document.getElementById('previewDesc');
      if (pd) pd.textContent = descInput.value || 'A short description of your token will appear here...';
    });

    if (initialBuyInput) {
      initialBuyInput.addEventListener('input', () => {
        const val = document.getElementById('previewInitialBuy');
        const v = initialBuyInput.value.trim();
        if (val) val.innerHTML = '<img src="/assets/pairs/ethereum.png" alt="ETH" class="sp-eth-icon"> ' + ((v && parseFloat(v) > 0) ? v + ' ETH' : '0.0 ETH');
        updateFooterDue();
      });
    }

    const creatorTaxInput = document.getElementById('creatorTax');
    if (creatorTaxInput) {
      creatorTaxInput.addEventListener('input', () => {
        let v = parseInt(creatorTaxInput.value) || 0;
        if (v < 0) v = 0;
        if (v > 10) v = 10;
        creatorTaxInput.value = v || '';
        const val = document.getElementById('previewTradeFee');
        if (val) val.textContent = v > 0 ? '1.00% + ' + v + '% yours' : '1.00%';
      });
    }

    // Social link preview icons
    const twitterInput = document.getElementById('tokenTwitter');
    const telegramInput = document.getElementById('tokenTelegram');
    if (twitterInput) twitterInput.addEventListener('input', () => {
      const el = document.getElementById('previewSocialX');
      if (el) el.hidden = !twitterInput.value.trim();
    });
    if (telegramInput) telegramInput.addEventListener('input', () => {
      const el = document.getElementById('previewSocialTg');
      if (el) el.hidden = !telegramInput.value.trim();
    });

    btnChoose.addEventListener('click', (e) => {
      if (e.target.closest('.upload-action-btn')) return;
      logoInput.click();
    });
    if (btnReplace) btnReplace.addEventListener('click', (e) => { e.stopPropagation(); logoInput.click(); });
    if (btnRemove) btnRemove.addEventListener('click', (e) => { e.stopPropagation(); clearUploadedImage(); });

    logoInput.addEventListener('change', async () => {
      const file = logoInput.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { showToast('Logo must be under 5MB.', 'error'); return; }

      const localUrl = URL.createObjectURL(file);
      logoPreview.src = localUrl;
      uploadPreview.hidden = false;
      uploadPlaceholder.hidden = true;
      document.getElementById('previewLogo').innerHTML = `<img src="${localUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;

      showToast('Uploading logo to IPFS...', 'info');
      try {
        const formData = new FormData();
        formData.append('file', file);
        const resp = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI2YTlmMTczNy1hNmZkLTQ1NTgtODZjMy04ODE4NDVmMDZiOWIiLCJlbWFpbCI6InByaW1hYW5nZ2FyYTJyQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaW5fcG9saWN5Ijp7InJlZ2lvbnMiOlt7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6IkZSQTEifSx7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6Ik5ZQzEifV0sInZlcnNpb24iOjF9LCJtZmFfZW5hYmxlZCI6ZmFsc2UsInN0YXR1cyI6IkFDVElWRSJ9LCJhdXRoZW50aWNhdGlvblR5cGUiOiJzY29wZWRLZXkiLCJzY29wZWRLZXlLZXkiOiJkOTBiODhjZWU3M2I1Nzk2YjhlNSIsInNjb3BlZEtleVNlY3JldCI6ImM2YzQ5MDMyZDgzNzc4NjYxZWY0OTY3MWZhZDVlYmQ2ZmY0ZGMzOGJmYmEzNzIyNWIwYTY0YmE2NmY4ODlmMDIiLCJleHAiOjE4MjE4ODk4NTJ9.OYi1JBVjurtDRzZIFhHCR9jvTLktL7hbDNgEo_2hFWY' },
          body: formData
        });
        if (!resp.ok) throw new Error('Upload failed: ' + resp.status);
        const data = await resp.json();
        if (!data.IpfsHash) throw new Error('No IPFS hash returned');
        const ipfsUrl = 'https://gateway.pinata.cloud/ipfs/' + data.IpfsHash;
        logoDataUrl = ipfsUrl;
        logoPreview.src = ipfsUrl;
        document.getElementById('previewLogo').innerHTML = `<img src="${ipfsUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        showToast('Logo uploaded!', 'success');
      } catch (e) {
        console.error('Pinata upload failed:', e);
        showToast('IPFS upload failed, using local preview', 'error');
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const size = 512;
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext('2d');
          const scale = Math.max(size / img.width, size / img.height);
          const w = img.width * scale, h = img.height * scale;
          ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
          logoDataUrl = canvas.toDataURL('image/webp', 0.85);
          showUploadedImage(logoDataUrl);
        };
        img.src = localUrl;
        return;
      }
      URL.revokeObjectURL(localUrl);
    });

    // Pair selector dropdown
    let selectedPair = window.PAIRED_ASSETS[0];
    const pairSelect = document.getElementById('pairSelect');
    const pairBtn = document.getElementById('pairSelectBtn');
    const pairDropdown = document.getElementById('pairDropdown');

    pairDropdown.innerHTML = window.PAIRED_ASSETS.map((p, i) =>
      `<button type="button" class="pair-option${i === 0 ? ' active' : ''}" data-idx="${i}">
        <img src="${p.img}" alt="">
        <span class="pair-option-symbol">${p.symbol}</span>
        <span class="pair-option-name">${p.name}</span>
      </button>`
    ).join('');

    pairBtn.addEventListener('click', () => pairSelect.classList.toggle('open'));
    document.addEventListener('click', (e) => {
      if (!pairSelect.contains(e.target)) pairSelect.classList.remove('open');
    });

    pairDropdown.addEventListener('click', (e) => {
      const opt = e.target.closest('.pair-option');
      if (!opt) return;
      const idx = parseInt(opt.dataset.idx);
      selectedPair = window.PAIRED_ASSETS[idx];
      document.getElementById('pairSelectedImg').src = selectedPair.img;
      document.getElementById('pairSelectedSymbol').textContent = selectedPair.symbol;
      pairDropdown.querySelectorAll('.pair-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      pairSelect.classList.remove('open');
      const previewPair = document.getElementById('previewPair');
      if (previewPair) previewPair.textContent = selectedPair.symbol;
      const fp = document.getElementById('footerPair');
      if (fp) fp.textContent = selectedPair.symbol + ' pair';
      const hint = document.getElementById('pairHint');
      if (hint) hint.textContent = selectedPair.symbol === 'ETH' ? 'Graduates once the curve raises 4.2 ETH' : `Paired with ${selectedPair.name} (${selectedPair.symbol})`;
    });

    // Advanced accordion
    const advToggle = document.getElementById('advancedToggle');
    const advSection = document.getElementById('advancedSection');
    advToggle.addEventListener('click', () => {
      advSection.classList.toggle('open');
    });

    // Website input shows link icon in preview
    const websiteInput = document.getElementById('tokenWebsite');
    if (websiteInput) websiteInput.addEventListener('input', () => {
      const el = document.getElementById('previewSocialWeb');
      if (el) el.hidden = !websiteInput.value.trim();
    });

    // Fetch launch fee and update footer
    let currentFee = CONTRACTS.LAUNCH_FEE_FALLBACK;
    const updateFooterDue = () => {
      const fd = document.getElementById('footerDue');
      if (fd) fd.textContent = currentFee;
    };

    window.contractManager.getLaunchFee().then(fee => {
      const formatted = ethers.formatEther(fee);
      currentFee = formatted;
      const pf = document.getElementById('previewFee');
      if (pf) pf.textContent = formatted;
      updateFooterDue();
    }).catch(() => {});

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      const symbol = symbolInput.value.trim().toUpperCase();
      const description = descInput.value.trim();
      if (!name || !symbol) { showToast('Fill in token name and ticker.', 'error'); return; }

      if (!window.walletManager.signer) {
        await window.walletManager.ensureProvider();
      }
      if (!window.walletManager.signer) {
        window.walletManager.disconnect();
        window.walletManager.connect();
        return;
      }

      const btn = document.getElementById('btnCreate');
      if (btn.disabled) return;
      btn.disabled = true;

      try {
        btn.innerHTML = '<span class="spinner"></span> Switching...';
        await window.contractManager.switchToRobinhood();
        await window.contractManager.init(window.walletManager.provider, window.walletManager.signer);

        const twitterVal = document.getElementById('tokenTwitter')?.value.trim() || '';
        const telegramVal = document.getElementById('tokenTelegram')?.value.trim() || '';
        const discordVal = document.getElementById('tokenDiscord')?.value.trim() || '';
        const websiteVal = document.getElementById('tokenWebsite')?.value.trim() || '';
        const twitter = twitterVal ? 'https://x.com/' + twitterVal : '';
        const telegram = telegramVal ? 'https://t.me/' + telegramVal : '';
        const discord = discordVal ? 'https://discord.gg/' + discordVal : '';
        const website = websiteVal;
        const creatorTax = parseInt(document.getElementById('creatorTax')?.value || '0');
        const initialBuy = document.getElementById('initialBuy')?.value.trim() || '';

        btn.innerHTML = '<span class="spinner"></span> Confirm in wallet...';

        const result = await window.contractManager.launchToken({
          name, symbol, description,
          logo: logoDataUrl || '',
          twitter, telegram, discord, website,
          creatorTaxBps: Math.min(creatorTax * 100, 1000),
          initialBuyEth: initialBuy,
          pairToken: selectedPair.address
        });

        btn.innerHTML = '<span class="spinner"></span> Saving...';
        const deployer = await window.walletManager.signer.getAddress();

        window.tokenRegistry.add({
          address: result.tokenAddress,
          curve: result.curveAddress,
          name, symbol, description,
          logo: logoDataUrl,
          deployer: result.deployer || deployer,
          txHash: result.txHash,
          launchedAt: new Date().toISOString(),
          twitter, telegram, discord, website,
          creatorTaxBps: Math.min(creatorTax * 100, 1000),
          _ownly: true
        });

        showToast(`${symbol} token deployed successfully!`, 'success');
        this.router.navigate(`/token/${result.tokenAddress}`);

      } catch (err) {
        console.error('Deploy error:', err);
        if (err.code === 'ACTION_REJECTED' || err.code === 4001) showToast('Transaction rejected.', 'error');
        else showToast('Deploy failed: ' + (err.reason || err.shortMessage || err.message || 'Unknown error'), 'error');
      } finally {
        const btn = document.getElementById('btnCreate');
        btn.disabled = false;
        btn.innerHTML = `Deploy Token <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
      }
    });
  }

  // ---- PORTFOLIO ----
  async renderPortfolio() {
    const sb = document.getElementById('searchBar');
    if (sb) sb.style.display = 'none';

    const tpl = document.getElementById('tpl-portfolio').content.cloneNode(true);
    document.getElementById('app').replaceChildren(tpl);
    const nn = document.getElementById('pfNetworkName');
    if (nn) nn.textContent = CONTRACTS.CHAIN_NAME;
    if (!window.walletManager.connected && !this._portfolioDemo) return;

    if (window.walletManager.connected && window.walletManager.chainId !== CONTRACTS.CHAIN_CONFIG.chainId) {
      await window.contractManager.switchToRobinhood();
      await new Promise(r => setTimeout(r, 1000));
    }

    const content = document.getElementById('portfolioContent');
    const isDemo = this._portfolioDemo && !window.walletManager.connected;

    const DEMO_WALLET = '0x53091256EBD2D8aA37B45536A5FD864ca764f32f';
    let demoAddr = isDemo ? DEMO_WALLET : null;

    const addr = isDemo ? (demoAddr || FEATURED_TOKENS[0].address) : window.walletManager.address;
    const shortAddr = isDemo ? (addr.slice(0, 6) + '…' + addr.slice(-4)) : window.walletManager.shortAddress();

    content.innerHTML = `
      ${isDemo ? '<div class="pf-demo-banner"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg> Demo preview — showing real on-chain data for ' + shortAddr + '</div>' : ''}
      <div class="portfolio-stats">
        <div class="portfolio-stat-card">
          <div class="stat-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg></div>
          <div class="stat-label">Wallet</div>
          <div class="stat-value" style="font-size:14px">${shortAddr}</div>
        </div>
        <div class="portfolio-stat-card">
          <div class="stat-icon"><img src="/assets/pairs/ethereum.png" alt="ETH" width="16" height="16" style="border-radius:50%"></div>
          <div class="stat-label">ETH Balance</div>
          <div class="stat-value" id="pEthBal">...</div>
        </div>
        <div class="portfolio-stat-card">
          <div class="stat-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
          <div class="stat-label">Portfolio Value</div>
          <div class="stat-value" id="pTotalVal">...</div>
        </div>
      </div>
      <div style="margin-top:20px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <h3 class="pf-section-title" style="margin:0">Holdings</h3>
          <div style="display:flex;gap:8px;align-items:center">
            <button id="pfRefreshBtn" class="pf-refresh-btn" onclick="this.classList.add('spinning');setTimeout(()=>this.classList.remove('spinning'),800);window.app.renderPortfolio()" title="Refresh data">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
            </button>
            ${!isDemo ? '<button onclick="window.walletManager.disconnect();window.app.router.navigate(\'/\')" style="font-size:12px;padding:6px 14px;border-radius:8px;border:1px solid #e0e7e9;background:transparent;color:#476267;cursor:pointer;font-family:var(--font-sans)">Disconnect</button>' : ''}
          </div>
        </div>
        <div id="pHoldings">
          <div class="pf-loading-state">
            <div class="sk-line w100" style="height:52px;border-radius:12px"></div>
            <div class="sk-line w100" style="height:52px;border-radius:12px"></div>
            <div class="sk-line w100" style="height:52px;border-radius:12px"></div>
          </div>
        </div>
      </div>
      <div style="margin-top:16px;text-align:center">
        <a href="${CONTRACTS.EXPLORER}/address/${addr}" target="_blank" rel="noopener" class="pf-explorer-link">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          View on Explorer
        </a>
      </div>`;

    if (isDemo) {
      const demoWallet = addr;
      (async () => {
        try {
          const apiBase = CONTRACTS.EXPLORER + '/api/v2/addresses/' + demoWallet;
          const [addrRes, tokenRes] = await Promise.all([
            fetch(apiBase).then(r => r.json()),
            fetch(apiBase + '/token-balances').then(r => r.json())
          ]);
          await fetchEthPrice();

          const ethWei = addrRes.coin_balance || '0';
          const ethNum = parseFloat(ethers.formatEther(BigInt(ethWei)));
          const pEthBal = document.getElementById('pEthBal');
          if (pEthBal) pEthBal.textContent = ethNum.toFixed(4) + ' ETH';

          const holdingsEl = document.getElementById('pHoldings');
          if (!holdingsEl) return;
          const holdings = [];

          if (Array.isArray(tokenRes)) {
            for (const tb of tokenRes) {
              const t = tb.token;
              if (!t || t.type !== 'ERC-20') continue;
              const dec = parseInt(t.decimals) || 18;
              const rawBal = BigInt(tb.value || '0');
              if (rawBal <= 0n) continue;
              const formatted = parseFloat(ethers.formatUnits(rawBal, dec));
              const price = parseFloat(t.exchange_rate) || 0;
              const valueUsd = formatted * price;
              holdings.push({
                token: t.address_hash || t.address,
                name: t.name || 'Unknown',
                symbol: t.symbol || '???',
                logo: t.icon_url || '',
                balance: rawBal,
                balFormatted: formatted,
                decimals: dec,
                priceUsd: price,
                valueUsd
              });
            }
          }

          holdings.sort((a, b) => b.valueUsd - a.valueUsd);
          const tokensUsd = holdings.reduce((s, h) => s + h.valueUsd, 0);
          const totalUsd = ethNum * ETH_PRICE_USD + tokensUsd;
          const pTotalVal = document.getElementById('pTotalVal');
          if (pTotalVal) pTotalVal.textContent = this.fmtUSD(totalUsd);

          const maxShow = 20;
          const displayHoldings = holdings.slice(0, maxShow);
          const hiddenCount = holdings.length - displayHoldings.length;

          if (!holdings.length) {
            holdingsEl.innerHTML = `
              <div class="pf-empty-state">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                <h3>No tokens held</h3>
                <p>This wallet has no ERC-20 token holdings.</p>
                <button class="btn btn-primary" onclick="window.app.router.navigate('/')" style="font-size:13px;padding:10px 24px">Explore Tokens</button>
              </div>`;
            return;
          }

          holdingsEl.innerHTML = `<div class="pf-holdings-list">${displayHoldings.map(h => {
            const initial = this.esc(h.symbol?.charAt(0) || '?');
            const logoHtml = h.logo
              ? `<img src="${h.logo}" style="width:36px;height:36px;border-radius:50%;object-fit:cover" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div style="width:36px;height:36px;border-radius:50%;background:rgba(20,184,166,0.08);display:none;align-items:center;justify-content:center;font-weight:700;color:var(--accent);font-size:14px">${initial}</div>`
              : `<div style="width:36px;height:36px;border-radius:50%;background:rgba(20,184,166,0.08);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--accent);font-size:14px">${initial}</div>`;
            return `
              <div class="pf-holding-row">
                <div class="pf-holding-left">
                  ${logoHtml}
                  <div>
                    <div style="font-weight:600;font-size:13px;color:#071A1E">${this.esc(h.name)}</div>
                    <div style="font-size:11px;color:#476267;font-family:var(--font-mono)">$${this.esc(h.symbol)}</div>
                  </div>
                </div>
                <div class="pf-holding-right" style="text-align:right">
                  <div style="font-weight:600;font-size:13px;color:#071A1E;font-family:var(--font-mono)">${h.balFormatted.toLocaleString(undefined, {maximumFractionDigits: 2})} ${this.esc(h.symbol)}</div>
                  ${h.valueUsd > 0 ? `<div style="font-size:11px;color:#476267;font-family:var(--font-mono)">${this.fmtUSD(h.valueUsd)}</div>` : ''}
                </div>
              </div>`;
          }).join('')}${hiddenCount > 0 ? `<div style="text-align:center;padding:12px;color:#476267;font-size:12px">+ ${hiddenCount} more tokens · <a href="${CONTRACTS.EXPLORER}/address/${demoWallet}" target="_blank" rel="noopener" style="color:var(--accent)">View all on Explorer</a></div>` : ''}</div>`;
        } catch (e) {
          console.warn('Demo portfolio error:', e);
          const holdingsEl = document.getElementById('pHoldings');
          if (holdingsEl) holdingsEl.innerHTML = `
            <div class="pf-empty-state">
              <p>Could not fetch on-chain data.</p>
              <button class="btn btn-outline" onclick="window.app._portfolioDemo=true;window.app.renderPortfolio()" style="font-size:12px">Retry</button>
            </div>`;
        }
      })();
      return;
    }

    try {
      const [ethBal, tokens] = await Promise.all([
        window.walletManager.getBalance(),
        window.tokenRegistry.fetchLiveData()
      ]);

      const ethNum = parseFloat(ethBal);
      const pEthBal = document.getElementById('pEthBal');
      if (pEthBal) pEthBal.textContent = ethNum.toFixed(4) + ' ETH';

      const holdingsEl = document.getElementById('pHoldings');
      if (!holdingsEl) return;
      const holdings = [];

      const balChecks = tokens.map(async (t) => {
        try {
          const bal = await window.walletManager.getTokenBalance(t.token);
          if (bal > 0n) {
            const formatted = parseFloat(ethers.formatEther(bal));
            const valueUsd = formatted * (t.priceUsd || 0);
            const valueEth = formatted * (t.priceEth || 0);
            holdings.push({ ...t, balance: bal, balFormatted: formatted, valueUsd, valueEth });
          }
        } catch {}
      });

      await Promise.allSettled(balChecks);
      holdings.sort((a, b) => b.valueUsd - a.valueUsd);

      const totalUsd = holdings.reduce((s, h) => s + h.valueUsd, 0) + ethNum * ETH_PRICE_USD;
      const pTotalVal = document.getElementById('pTotalVal');
      if (pTotalVal) pTotalVal.textContent = this.fmtUSD(totalUsd);

      if (!holdings.length) {
        holdingsEl.innerHTML = `
          <div class="pf-empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            <h3>No tokens in this wallet yet</h3>
            <p>Start by exploring and buying tokens on Ownly.</p>
            <button class="btn btn-primary" onclick="window.app.router.navigate('/')" style="font-size:13px;padding:10px 24px">Explore Tokens</button>
          </div>`;
        return;
      }

      holdingsEl.innerHTML = `<div class="pf-holdings-list">${holdings.map(h => {
        const logoSrc = this.fixLogoUrl(h.logo);
        const initial = this.esc(h.symbol?.charAt(0) || '?');
        const logoHtml = logoSrc
          ? `<img src="${logoSrc}" style="width:36px;height:36px;border-radius:50%;object-fit:cover" onerror="this.replaceWith(document.createTextNode('${initial}'))">`
          : `<div style="width:36px;height:36px;border-radius:50%;background:rgba(20,184,166,0.08);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--accent);font-size:14px">${initial}</div>`;
        return `
          <div class="pf-holding-row" onclick="window.app.router.navigate('/token/${h.token}')">
            <div class="pf-holding-left">
              ${logoHtml}
              <div>
                <div style="font-weight:600;font-size:13px;color:#071A1E">${this.esc(h.name)}</div>
                <div style="font-size:11px;color:#476267;font-family:var(--font-mono)">$${this.esc(h.symbol)}</div>
              </div>
            </div>
            <div class="pf-holding-right">
              <div style="font-weight:600;font-size:13px;color:#071A1E;font-family:var(--font-mono)">${this.fmtTokens(h.balance)} ${this.esc(h.symbol)}</div>
              <div style="font-size:11px;color:#476267;font-family:var(--font-mono)">${this.fmtUSD(h.valueUsd)}</div>
            </div>
          </div>`;
      }).join('')}</div>`;
    } catch (e) {
      console.warn('Portfolio load error:', e);
      const holdingsEl = document.getElementById('pHoldings');
      if (holdingsEl) holdingsEl.innerHTML = `
        <div class="pf-error-state">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:#476267;margin-bottom:8px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <p style="margin-bottom:12px">Failed to load holdings. Please try again.</p>
          <button class="btn btn-outline" onclick="window.app.renderPortfolio()" style="font-size:12px">Retry</button>
        </div>`;
    }
  }

  // ---- LEGAL PAGES ----
  renderLegal(tplId) {
    if (this._tradesInterval) { clearInterval(this._tradesInterval); this._tradesInterval = null; }
    const sb = document.getElementById('searchBar');
    if (sb) sb.style.display = 'none';
    const app = document.getElementById('app');
    const tpl = document.getElementById(tplId);
    app.innerHTML = '';
    app.appendChild(tpl.content.cloneNode(true));
    window.scrollTo(0, 0);
  }

  // ---- HOW IT WORKS ----
  renderHow() {
    if (this._tradesInterval) { clearInterval(this._tradesInterval); this._tradesInterval = null; }
    const sb = document.getElementById('searchBar');
    if (sb) sb.style.display = 'none';
    const app = document.getElementById('app');
    const tpl = document.getElementById('tpl-how');
    app.innerHTML = '';
    app.appendChild(tpl.content.cloneNode(true));
  }

  // ---- AI AGENTS ----
  async renderAgents() {
    if (this._tradesInterval) { clearInterval(this._tradesInterval); this._tradesInterval = null; }
    const sb = document.getElementById('searchBar');
    if (sb) sb.style.display = 'none';

    const tpl = document.getElementById('tpl-agents');
    if (!tpl) return;
    const app = document.getElementById('app');
    app.innerHTML = '';
    app.appendChild(tpl.content.cloneNode(true));
  }

  // ---- 404 ----
  render404(path) {
    if (this._tradesInterval) { clearInterval(this._tradesInterval); this._tradesInterval = null; }
    const sb = document.getElementById('searchBar');
    if (sb) sb.style.display = 'none';
    const tb = document.getElementById('tickerBar');
    if (tb) tb.style.display = 'none';
    const app = document.getElementById('app');
    app.innerHTML = `
      <section class="page-404">
        <div class="page-404-inner">
          <div class="page-404-code">404</div>
          <h1>Page Not Found</h1>
          <p>The page <strong>${this.esc(path)}</strong> doesn't exist or has been moved.</p>
          <div class="page-404-actions">
            <a href="/" data-link class="btn btn-primary">Back to Explore</a>
            <a href="/create" data-link class="btn btn-outline">Create Token</a>
          </div>
        </div>
      </section>`;
  }

  // ---- DOCS ----
  renderDocs() {
    if (this._tradesInterval) { clearInterval(this._tradesInterval); this._tradesInterval = null; }
    const sb = document.getElementById('searchBar');
    if (sb) sb.style.display = 'none';
    const app = document.getElementById('app');
    const tpl = document.getElementById('tpl-docs');
    app.innerHTML = '';
    app.appendChild(tpl.content.cloneNode(true));

    this._loadDocSection('overview');

    const sidebar = document.getElementById('docsSidebar');
    if (sidebar) {
      sidebar.addEventListener('click', (e) => {
        const link = e.target.closest('[data-doc]');
        if (!link) return;
        e.preventDefault();
        sidebar.querySelectorAll('.docs-nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        this._loadDocSection(link.dataset.doc);
      });
    }
  }

  _loadDocSection(key) {
    const content = document.getElementById('docsContent');
    if (!content) return;
    const sections = {
      overview: `
        <h2>Overview</h2>
        <p>OWNLY is an <strong>AI Agent Launchpad</strong> built on <strong>Robinhood Chain</strong> (Chain ID 4663). It enables anyone to create and trade AI agent tokens using automated bonding curves powered by the Pons V2 Factory.</p>
        <p>Each token launches with a fixed supply of 1,000,000,000 on a bonding curve where the price rises with demand. When the curve accumulates 4.2 ETH in reserves, the token graduates — liquidity migrates to a Uniswap V4 pool and is permanently locked.</p>
        <h3>Key Features</h3>
        <ul>
          <li>Launch AI agent tokens with custom branding, description, and social links</li>
          <li>Fair pricing through automated bonding curves</li>
          <li>Built-in snipe protection (99% tax for the first 3 seconds)</li>
          <li>Automatic graduation to Uniswap V4 at 4.2 ETH threshold</li>
          <li>Permanently locked liquidity after graduation — no rug pulls</li>
          <li>Real-time price charts, trade history, and holder tracking</li>
          <li>Optional creator tax (up to 10% of the 1% trading fee)</li>
          <li>Non-custodial — all trades execute directly from your wallet</li>
        </ul>`,
      chain: `
        <h2>Robinhood Chain</h2>
        <p>OWNLY is deployed on Robinhood Chain, an EVM-compatible Layer 2 network designed for fast and low-cost transactions.</p>
        <h3>Network Details</h3>
        <div class="docs-table">
          <div class="docs-table-row"><span class="docs-table-label">Chain Name</span><span class="docs-table-value">Robinhood Chain</span></div>
          <div class="docs-table-row"><span class="docs-table-label">Chain ID</span><span class="docs-table-value">4663 (0x1237)</span></div>
          <div class="docs-table-row"><span class="docs-table-label">Native Currency</span><span class="docs-table-value">ETH</span></div>
          <div class="docs-table-row"><span class="docs-table-label">RPC URL</span><span class="docs-table-value"><code>https://rpc.mainnet.chain.robinhood.com</code></span></div>
          <div class="docs-table-row"><span class="docs-table-label">Block Explorer</span><span class="docs-table-value"><a href="https://robinhoodchain.blockscout.com" target="_blank" rel="noopener">robinhoodchain.blockscout.com</a></span></div>
        </div>
        <h3>Adding to Your Wallet</h3>
        <p>OWNLY automatically prompts you to add Robinhood Chain when you connect your wallet. You can also add it manually using the network details above in MetaMask or any EVM-compatible wallet.</p>`,
      wallet: `
        <h2>Wallet Setup</h2>
        <p>OWNLY supports any EVM-compatible wallet that connects through the browser. No account creation or sign-up is needed.</p>
        <h3>Supported Wallets</h3>
        <ul>
          <li><strong>MetaMask</strong> — the most popular browser extension wallet</li>
          <li><strong>Rabby</strong> — multi-chain wallet with built-in security features</li>
          <li><strong>Coinbase Wallet</strong> — Coinbase's self-custody wallet</li>
          <li><strong>Trust Wallet</strong> — mobile wallet with browser extension</li>
          <li><strong>Bitget Wallet</strong> — multi-chain Web3 wallet</li>
          <li><strong>OKX Wallet</strong> — OKX's self-custody wallet</li>
          <li><strong>Phantom</strong> — popular multi-chain wallet</li>
          <li>Any wallet that injects <code>window.ethereum</code> or supports EIP-6963</li>
        </ul>
        <h3>Getting ETH on Robinhood Chain</h3>
        <p>You need ETH on Robinhood Chain to create tokens and trade. Bridge ETH from Ethereum mainnet using the official Robinhood Chain bridge or supported bridge providers.</p>`,
      create: `
        <h2>Creating an AI Agent Token</h2>
        <p>Navigate to the <strong>Create</strong> page to launch your AI agent token.</p>
        <h3>Required Fields</h3>
        <ul>
          <li><strong>Name</strong> — your token's display name (max 32 characters)</li>
          <li><strong>Ticker</strong> — short symbol, e.g. AGENT or MYAI (max 8 characters)</li>
        </ul>
        <h3>Optional Fields</h3>
        <ul>
          <li><strong>Description</strong> — describe your AI agent and its purpose (max 500 characters)</li>
          <li><strong>Token image</strong> — PNG, JPG, or WebP logo up to 2MB</li>
          <li><strong>Social links</strong> — X (Twitter) and Telegram links for your community</li>
          <li><strong>Initial buy</strong> — buy tokens at launch to hold an initial position</li>
          <li><strong>Creator tax</strong> — earn up to 10% of the 1% trading fee on every trade</li>
        </ul>
        <h3>Launch Fee</h3>
        <p>Creating a token costs <strong>0.0005 ETH</strong>. If you add an initial buy, that amount is added on top of the launch fee. The total cost is shown before you confirm the transaction.</p>`,
      bonding: `
        <h2>Bonding Curve</h2>
        <p>Every AI agent token on OWNLY launches with an automated bonding curve — a smart contract that algorithmically determines the token price based on supply and demand.</p>
        <h3>How It Works</h3>
        <p>The bonding curve holds two reserves: ETH and tokens. When you buy, you send ETH to the curve and receive tokens. When you sell, you return tokens and receive ETH back.</p>
        <p>The price is calculated as: <code>price = quoteReserve / tokenReserve</code></p>
        <h3>Price Mechanics</h3>
        <ul>
          <li>Price starts low and increases as more ETH enters the curve</li>
          <li>Early supporters get more tokens per ETH spent</li>
          <li>Selling tokens decreases the price proportionally</li>
          <li>The curve guarantees there is always liquidity available to trade against</li>
        </ul>
        <h3>Snipe Protection</h3>
        <p>To prevent bots from front-running new token launches, OWNLY applies a <strong>99% tax for the first 3 seconds</strong> after deployment. This ensures regular users get a fair chance to participate early.</p>`,
      graduation: `
        <h2>Graduation to DEX</h2>
        <p>When a token's bonding curve accumulates <strong>4.2 ETH</strong> in real reserves, the token automatically graduates to a decentralized exchange.</p>
        <h3>What Happens at Graduation</h3>
        <ol>
          <li>The bonding curve closes — no more buys or sells through the curve</li>
          <li>All accumulated liquidity (ETH + remaining tokens) migrates to a Uniswap V4 pool</li>
          <li>Liquidity is permanently locked in the pool — it can never be withdrawn by anyone</li>
          <li>The token becomes freely tradeable on Uniswap and other DEX aggregators</li>
        </ol>
        <h3>Why Graduation Matters</h3>
        <p>Graduation is the core safety mechanism of OWNLY. Once a token graduates, permanent liquidity exists on Uniswap. No one — not even the token creator — can remove it. This eliminates the possibility of rug pulls and ensures long-term tradeability.</p>`,
      buy: `
        <h2>Buying Tokens</h2>
        <p>Navigate to any AI agent token page and use the trade panel on the left side.</p>
        <h3>Steps</h3>
        <ol>
          <li>Connect your wallet and ensure you are on Robinhood Chain</li>
          <li>Enter the amount of ETH you want to spend</li>
          <li>Use the quick amount buttons (0.01, 0.05, 0.1, 0.5, 1 ETH) for convenience</li>
          <li>Set your slippage tolerance (default is 2%)</li>
          <li>Click <strong>Buy</strong> and confirm the transaction in your wallet</li>
        </ol>
        <h3>Estimated Output</h3>
        <p>The estimated number of tokens you will receive is displayed before you confirm. The actual amount may differ slightly due to slippage and concurrent trades from other users.</p>`,
      sell: `
        <h2>Selling Tokens</h2>
        <p>Switch to the <strong>Sell</strong> tab on the token page to sell tokens you hold.</p>
        <h3>Steps</h3>
        <ol>
          <li>Connect your wallet</li>
          <li>Switch to the Sell tab</li>
          <li>Enter the number of tokens to sell, or use 25%, 50%, or 100% quick buttons</li>
          <li>The first time you sell a token, you will need to approve it for the bonding curve contract</li>
          <li>Click <strong>Sell</strong> and confirm the transaction in your wallet</li>
        </ol>
        <h3>Price Impact</h3>
        <p>Selling a large number of tokens will reduce the price. The bonding curve calculates the ETH output based on current reserves — larger sells result in proportionally less ETH per token due to the curve mechanics.</p>`,
      slippage: `
        <h2>Slippage Settings</h2>
        <p>Slippage is the maximum price difference you are willing to accept between the quoted price and the actual execution price.</p>
        <h3>Preset Options</h3>
        <ul>
          <li><strong>1%</strong> — tight slippage, transaction may fail if price moves during execution</li>
          <li><strong>2%</strong> — default setting, balanced between execution success and price protection</li>
          <li><strong>5%</strong> — loose slippage, higher chance of execution but less price protection</li>
          <li><strong>Custom</strong> — enter any value up to 50% for fine-grained control</li>
        </ul>
        <h3>When to Increase Slippage</h3>
        <p>If your transactions fail with "slippage exceeded" errors, increase your slippage tolerance. This commonly happens during periods of high trading activity when the price is moving rapidly between blocks.</p>`,
      contracts: `
        <h2>Contract Addresses</h2>
        <p>All OWNLY smart contracts are deployed on Robinhood Chain and verified on Blockscout.</p>
        <div class="docs-table">
          <div class="docs-table-row">
            <span class="docs-table-label">Pons V2 Factory</span>
            <span class="docs-table-value"><code><a href="https://robinhoodchain.blockscout.com/address/0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e" target="_blank" rel="noopener">0x7eD598...EC7e</a></code></span>
          </div>
          <div class="docs-table-row">
            <span class="docs-table-label">Pons V2 Router</span>
            <span class="docs-table-value"><code><a href="https://robinhoodchain.blockscout.com/address/0xe33E9E479dF8802cb0866d5d05258bEc4cF62948" target="_blank" rel="noopener">0xe33E9E...2948</a></code></span>
          </div>
        </div>
        <h3>Per-Token Contracts</h3>
        <p>Each AI agent token launched through OWNLY creates two on-chain contracts:</p>
        <ul>
          <li><strong>Token contract (ERC-20)</strong> — standard token with metadata (name, symbol, description, logo)</li>
          <li><strong>Curve contract</strong> — bonding curve that handles all buy and sell operations</li>
        </ul>
        <p>You can find both contract addresses on any token's detail page. Click the address to copy it, or click "View on Explorer" to inspect it on Blockscout.</p>`,
      abi: `
        <h2>ABI Reference</h2>
        <p>Use these function signatures to interact with OWNLY contracts programmatically.</p>
        <h3>Factory (Token Deployment)</h3>
        <pre><code>launchToken(params, launchConfigId, pairToken) payable
previewLaunchEconomics(launchConfigId, pairToken) view
launchFee() view returns (uint256)
getLaunchedToken(token) view returns (TokenInfo)</code></pre>
        <h3>Bonding Curve (Trading)</h3>
        <pre><code>buy(quoteIn, minTokensOut, recipient) payable
sell(tokensIn, minQuoteOut, recipient)
getReserves() view returns (quoteReserve, tokenReserve)
realQuoteReserve() view returns (uint256)
graduationThreshold() view returns (uint256)
graduated() view returns (bool)</code></pre>
        <h3>ERC-20 Token</h3>
        <pre><code>name() view returns (string)
symbol() view returns (string)
balanceOf(address) view returns (uint256)
approve(address spender, uint256 amount)
getTokenInfo() view returns (deployer, logo, description, socials)</code></pre>
        <h3>Events</h3>
        <pre><code>TokenLaunched(token, curve, deployer, pairToken, configId, threshold)
CurveBuy(buyer, recipient, quoteIn, tokensOut, fee, tax)
CurveSell(seller, recipient, tokensIn, quoteOut, fee, tax)</code></pre>`
    };
    content.innerHTML = sections[key] || '<p>Section not found.</p>';
  }
}

// Dark theme only
function initTheme() {
  document.documentElement.removeAttribute('data-theme');
}
initTheme();

// OWNLY Live Recent Buys Ticker — uses Blockscout API
class RecentBuysTicker {
  constructor() {
    this.items = [];
    this.maxItems = 30;
    this.el = document.getElementById('tickerContent');
    this.polling = false;
    this.buyTopic = null;
    this.sellTopic = null;
  }

  async start() {
    if (this.polling) return;
    this.polling = true;
    this.buyTopic = ethers.id('CurveBuy(address,address,uint256,uint256,uint256,uint256)');
    this.sellTopic = ethers.id('CurveSell(address,address,uint256,uint256,uint256,uint256)');
    await this.fetchRecent();
    this.pollInterval = setInterval(() => this.fetchRecent(), 30000);
  }

  async fetchRecent() {
    try {
      const discovered = window.tokenRegistry?._loadDiscoveryCache() || [];
      const local = window.tokenRegistry?.getAll() || [];
      const all = [...local, ...discovered].filter(t => t.curve);
      if (!all.length) return;

      const curves = all.slice(0, 4);
      const allEvents = [];

      const fetches = curves.map(async (t, idx) => {
        if (idx > 0) await new Promise(r => setTimeout(r, idx * 300));
        try {
          const url = `${CONTRACTS.EXPLORER}/api?module=logs&action=getLogs&address=${t.curve}&fromBlock=0&toBlock=latest`;
          const resp = await fetch(url);
          const data = await resp.json();
          if (data.status !== '1' || !data.result) return;
          for (const log of data.result) {
            const topic0 = log.topics?.[0];
            if (topic0 === this.buyTopic) {
              const buyer = '0x' + log.topics[1].slice(26);
              const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['uint256','uint256','uint256','uint256'], log.data);
              allEvents.push({
                type: 'buy', buyer, quoteIn: decoded[0], tokensOut: decoded[1],
                symbol: t.symbol || '???', name: t.name || 'Unknown',
                token: t.address || t.token, block: parseInt(log.blockNumber, 16), txHash: log.transactionHash
              });
            } else if (topic0 === this.sellTopic) {
              const seller = '0x' + log.topics[1].slice(26);
              const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['uint256','uint256','uint256','uint256'], log.data);
              allEvents.push({
                type: 'sell', buyer: seller, quoteOut: decoded[1], tokensIn: decoded[0],
                symbol: t.symbol || '???', name: t.name || 'Unknown',
                token: t.address || t.token, block: parseInt(log.blockNumber, 16), txHash: log.transactionHash
              });
            }
          }
        } catch {}
      });

      await Promise.allSettled(fetches);
      allEvents.sort((a, b) => b.block - a.block);
      this.items = allEvents.slice(0, this.maxItems);
      this.render();
    } catch (e) {
      console.warn('Ticker fetch error:', e);
    }
  }

  shortAddr(a) {
    return a ? a.slice(0, 6) + '...' + a.slice(-4) : '';
  }

  render() {
    if (!this.el) return;
    if (!this.items.length) {
      this.el.innerHTML = '<span class="ticker-placeholder">Connected · Watching for trades...</span>';
      return;
    }

    const duped = [...this.items, ...this.items];
    this.el.innerHTML = duped.map(item => {
      const ethVal = item.type === 'buy' ? item.quoteIn : item.quoteOut;
      const eth = parseFloat(ethers.formatEther(ethVal)).toFixed(4);
      const click = `onclick="window.app.router.navigate('/token/${item.token}')"`;
      const actionClass = item.type === 'sell' ? 'ti-action sell' : 'ti-action';
      const label = item.type === 'buy' ? 'BUY' : 'SELL';
      return `<span class="ticker-item" ${click}>
        <span class="${actionClass}">${label}</span>
        <span class="ti-symbol">$${item.symbol}</span>
        <span class="ti-amount">${eth} ETH</span>
        <span class="ti-addr">${this.shortAddr(item.buyer)}</span>
      </span><span class="ticker-sep">&bull;</span>`;
    }).join('');
  }

  stop() {
    this.polling = false;
    clearInterval(this.pollInterval);
  }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new App();
  window.app = app;
  const ticker = new RecentBuysTicker();
  ticker.start();
  window.recentTicker = ticker;
});
