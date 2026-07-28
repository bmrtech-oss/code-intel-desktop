// Debug: confirm this script is loaded in the browser console
console.log('main.js loaded');

(function() {
  // === Safe Timeout Helper ===
  const getTimeoutSignal = (ms) => {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      return AbortSignal.timeout(ms);
    }
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  };

  // === Theme Manager ===
  const getPreferredTheme = () => {
    const stored = localStorage.getItem('code-intel-theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };
  const setTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('code-intel-theme', theme);
    updateUI(theme);
  };
  const toggleTheme = () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
  };
  const updateUI = (theme) => {
    const icon = document.getElementById('themeIcon');
    if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    const label = document.getElementById('themeLabel');
    const emoji = document.getElementById('themeEmoji');
    if (label) label.textContent = theme === 'dark' ? 'Dark' : 'Light';
    if (emoji) emoji.textContent = theme === 'dark' ? '🌙' : '☀️';
  };

  // === CodeIntel Service (REST) ===
  class CodeIntelService {
    constructor() {
      let storedUrl = localStorage.getItem('code-intel-server-url');
      if (storedUrl === 'http://localhost:8080') {
        storedUrl = 'http://localhost:8000';
        localStorage.setItem('code-intel-server-url', 'http://localhost:8000');
      }
      this.baseUrl = storedUrl || 'http://localhost:8000';

      let storedMcp = localStorage.getItem('code-intel-mcp-url');
      if (storedMcp === 'mcp://localhost:8080') {
        storedMcp = 'mcp://localhost:8000';
        localStorage.setItem('code-intel-mcp-url', 'mcp://localhost:8000');
      }
      this.mcpUrl = storedMcp || 'mcp://localhost:8000';

      this.connected = false;
      this.mcpConnected = false;
      this.graphData = null;
      this.mcpTools = [];
      this.demoMode = false;
      this.currentCommitSHA = null;
    }

    async safeFetch(url, options = {}) {
      try {
        let resp;
        try {
          resp = await fetch(url, options);
        } catch (fetchErr) {
          // If fetch fails and the URL starts with localhost, auto-retry using 127.0.0.1
          const localhostPrefix = 'http://localhost:';
          if (url.startsWith(localhostPrefix)) {
            const fallbackUrl = url.replace(localhostPrefix, 'http://127.0.0.1:');
            console.log(`[CORS/Network Fallback] Retrying ${url} using ${fallbackUrl}`);
            resp = await fetch(fallbackUrl, options);

            // If the fallback succeeded and it is a request to our baseUrl, permanently update baseUrl to use 127.0.0.1
            if (url.startsWith(this.baseUrl)) {
              this.baseUrl = this.baseUrl.replace(localhostPrefix, 'http://127.0.0.1:');
              localStorage.setItem('code-intel-server-url', this.baseUrl);
              console.log(`[CORS/Network Fallback] Migrated baseUrl to ${this.baseUrl}`);
            }
          } else {
            throw fetchErr;
          }
        }

        const normUrl = url.replace('http://localhost:', 'http://127.0.0.1:');
        const normBase = this.baseUrl.replace('http://localhost:', 'http://127.0.0.1:');

        if (!resp.ok) {
          if (resp.status === 502 || resp.status === 503) {
            if (normUrl.startsWith(normBase)) {
              triggerOfflineMode(true);
            }
          }
          throw new Error(`Fetch failed with status ${resp.status}`);
        }
        if (normUrl.startsWith(normBase)) {
          triggerOfflineMode(false);
        }
        return resp;
      } catch (e) {
        const normUrl = url.replace('http://localhost:', 'http://127.0.0.1:');
        const normBase = this.baseUrl.replace('http://localhost:', 'http://127.0.0.1:');
        const isNetworkErr = e instanceof TypeError || /Failed to fetch|NetworkError|CORS|TypeError/i.test(e.message || String(e));
        if (isNetworkErr && normUrl.startsWith(normBase)) {
          triggerOfflineMode(true);
        }
        throw e;
      }
    }

    async connect() {
      try {
        const resp = await this.safeFetch(`${this.baseUrl}/api/status`, { signal: getTimeoutSignal(3000) });
        const data = await resp.json();
        this.connected = true;
        this.connectError = null;

        // Check if backend payload indicates containerized/running in Docker
        if (data && (data.is_docker === true || data.docker === true || data.dockerMode === true || data.docker_mode === true || data.environment === 'docker')) {
          localStorage.setItem('dockerMode', 'true');
        } else {
          localStorage.setItem('dockerMode', 'false');
        }

        return data;
      } catch (e) {
        this.connected = false;
        this.connectError = e.message || String(e);

        // Handle CORS / Network error gracefully with an intuitive console warning
        const isCorsOrNetwork = /Failed to fetch|NetworkError|CORS|TypeError/i.test(this.connectError);
        if (isCorsOrNetwork) {
          console.warn(
            '⚠️ [CORS / Network Warning] Connection to CodeIntel backend failed. This may be due to missing CORS headers on the FastAPI server (expected origins: tauri://localhost or http://tauri.localhost) or the server being offline. Error details:',
            this.connectError
          );
        } else {
          console.warn('Fallback to mock data. Server error:', this.connectError);
        }

        return { status: 'mock', version: '0.0.0', index: 'ready' };
      }
    }

    async getGraph() {
      if (this.demoMode) {
        this.graphData = this.getDemoGraphData();
        return this.graphData;
      }
      if (this.graphData && !this.currentCommitSHA) return this.graphData;
      try {
        let url = `${this.baseUrl}/graph`;
        if (this.currentCommitSHA) {
          url += `?version=${encodeURIComponent(this.currentCommitSHA)}`;
        } else {
          url += `?version=latest`;
        }
        const resp = await this.safeFetch(url);
        this.graphData = await resp.json();
        return this.graphData;
      } catch (e) {
        try {
          const resp = await this.safeFetch(`${this.baseUrl}/api/graph`);
          this.graphData = await resp.json();
          return this.graphData;
        } catch (err) {
          console.warn('Fallback to empty canvas in offline/error state', err);
          this.graphData = {
            nodes: [],
            edges: []
          };
          return this.graphData;
        }
      }
    }

    // === LLM Requirements Generation ===
    async generateRequirements(nodeIds, context, provider, model) {
      try {
        const resp = await this.safeFetch(`${this.baseUrl}/api/llm/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodeIds, context, provider, model })
        });
        return await resp.json();
      } catch (e) {
        console.warn('LLM generation fallback to mock', e.message);
        let md = `# Requirements (Mock Fallback)\n\n**Model**: ${model}\n\n`;
        let rows = [];
        nodeIds.forEach((id, idx) => {
          const info = nodeMap[id];
          if (!info) return;
          md += `## REQ-${String(idx+1).padStart(3,'0')}: ${info.label}\n`;
          md += `- Type: ${info.type}\n`;
          md += `- Depends on: ${this.graphData.edges.filter(e=>e.source===id).map(e=>nodeMap[e.target]?.label||e.target).join(', ')}\n\n`;
          rows.push({ id: `REQ-${String(idx+1).padStart(3,'0')}`, desc: `Implementation of ${info.label}`, node: info.label });
        });
        return { markdown: md, traceability: rows };
      }
    }

    canFetchUrl(url) {
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch (e) {
        return false;
      }
    }

    getDemoGraphData() {
      return {
        nodes: [
          { id: 'n1', label: 'AuthService', type: 'class' },
          { id: 'n2', label: 'login', type: 'function' },
          { id: 'n3', label: 'validateUser', type: 'function' },
          { id: 'n4', label: 'hashPassword', type: 'function' },
          { id: 'n5', label: 'UserRepository', type: 'class' },
          { id: 'n6', label: 'findByEmail', type: 'function' },
          { id: 'n7', label: 'DatabaseConnection', type: 'class' },
          { id: 'n8', label: 'query', type: 'function' },
          { id: 'n9', label: 'Logger', type: 'class' },
          { id: 'n10', label: 'log', type: 'function' },
          { id: 'n11', label: 'ConfigService', type: 'class' },
          { id: 'n12', label: 'getSecret', type: 'function' },
          { id: 'n13', label: 'TokenService', type: 'class' },
          { id: 'n14', label: 'generateToken', type: 'function' },
          { id: 'n15', label: 'verifyToken', type: 'function' },
          { id: 'n16', label: 'EmailService', type: 'class' },
          { id: 'n17', label: 'sendWelcome', type: 'function' },
          { id: 'n18', label: 'User', type: 'class' },
          { id: 'n19', label: 'Role', type: 'enum' },
          { id: 'n20', label: 'main', type: 'function' },
        ],
        edges: [
          { source: 'n2', target: 'n3', type: 'calls' },
          { source: 'n2', target: 'n4', type: 'calls' },
          { source: 'n2', target: 'n5', type: 'calls' },
          { source: 'n3', target: 'n6', type: 'calls' },
          { source: 'n3', target: 'n18', type: 'calls' },
          { source: 'n6', target: 'n7', type: 'calls' },
          { source: 'n6', target: 'n8', type: 'calls' },
          { source: 'n5', target: 'n7', type: 'calls' },
          { source: 'n1', target: 'n9', type: 'calls' },
          { source: 'n1', target: 'n11', type: 'calls' },
          { source: 'n1', target: 'n13', type: 'calls' },
          { source: 'n14', target: 'n12', type: 'calls' },
          { source: 'n14', target: 'n10', type: 'calls' },
          { source: 'n15', target: 'n12', type: 'calls' },
          { source: 'n16', target: 'n17', type: 'calls' },
          { source: 'n17', target: 'n10', type: 'calls' },
          { source: 'n20', target: 'n1', type: 'calls' },
          { source: 'n20', target: 'n16', type: 'calls' },
          { source: 'n20', target: 'n14', type: 'calls' },
          { source: 'n2', target: 'n1', type: 'imports' },
          { source: 'n3', target: 'n5', type: 'imports' },
          { source: 'n6', target: 'n7', type: 'imports' },
          { source: 'n14', target: 'n11', type: 'imports' },
          { source: 'n17', target: 'n9', type: 'imports' },
          { source: 'n5', target: 'n18', type: 'imports' },
          { source: 'n1', target: 'n18', type: 'imports' },
        ]
      };
    }

    // === MCP Discovery ===
    async getMCPInfo() {
      if (!this.canFetchUrl(this.mcpUrl)) {
        console.warn('Skipping MCP discovery: unsupported protocol for browser fetch:', this.mcpUrl);
        this.mcpConnected = false;
        this.mcpTools = [];
        return { tools: [] };
      }

      try {
        const resp = await fetch(`${this.mcpUrl}/info`, { signal: getTimeoutSignal(2000) });
        if (!resp.ok) throw new Error('MCP endpoint unreachable');
        const data = await resp.json();
        this.mcpConnected = true;
        this.mcpTools = data.tools || [];
        return data;
      } catch (e) {
        this.mcpConnected = false;
        this.mcpTools = [];
        console.warn('MCP endpoint unavailable:', e.message);
        return { tools: [] };
      }
    }

    async discoverMCPTools() {
      const info = await this.getMCPInfo();
      return info.tools || [];
    }
  }

  // === Main Application ===
  const service = new CodeIntelService();
  let nodeMap = {};
  let cy = null;
  let selectedNodeIds = [];
  let currentRepoTree = null;
  let currentRepoSource = 'Demo project';
  let activeEventSource = null;

  function subscribeToIngestionStream(jobId) {
    if (!jobId) {
      console.warn("No jobId provided for subscribeToIngestionStream");
      return;
    }

    // Close any existing active stream
    if (activeEventSource) {
      activeEventSource.close();
    }

    const progressContainer = document.getElementById('ingestionProgress');
    const progressText = document.getElementById('progressText');
    const progressPercent = document.getElementById('progressPercent');
    const progressBar = document.getElementById('progressBar');

    if (progressContainer) {
      progressContainer.style.display = 'flex';
    }
    if (progressText) progressText.textContent = 'Connecting stream...';
    if (progressPercent) progressPercent.textContent = '0%';
    if (progressBar) {
      progressBar.style.width = '0%';
      progressBar.style.background = 'var(--theme-primary)';
    }

    const streamUrl = `${service.baseUrl}/analyze/stream?job_id=${jobId}`;
    console.log(`Subscribing to SSE stream: ${streamUrl}`);

    const es = new EventSource(streamUrl);
    activeEventSource = es;

    es.onmessage = (event) => {
      console.log('Received SSE message:', event.data);
      try {
        const payload = JSON.parse(event.data);
        const fileName = payload.file || '';
        const progress = payload.progress !== undefined ? payload.progress : 0;
        const total = payload.total !== undefined ? payload.total : 100;
        const percent = total > 0 ? Math.round((progress / total) * 100) : progress;
        const isDone = payload.done === true;
        const error = payload.error || '';

        if (progressText) {
          if (fileName) {
            progressText.textContent = `Ingesting: ${fileName} (${progress}/${total} files)`;
          } else {
            progressText.textContent = `Ingesting (${progress}/${total} files)`;
          }
        }
        if (progressPercent) progressPercent.textContent = `${percent}%`;
        if (progressBar) progressBar.style.width = `${percent}%`;

        if (error) {
          console.error('Ingestion error received:', error);
          if (progressText) progressText.textContent = `Error: ${error}`;
          if (progressBar) progressBar.style.background = 'var(--theme-danger)';
          es.close();
          activeEventSource = null;
          // Hide progress after a small delay
          setTimeout(() => {
            if (progressContainer) progressContainer.style.display = 'none';
          }, 5000);
          return;
        }

        if (isDone) {
          console.log('Ingestion SSE stream finished: received done signal');
          if (progressText) progressText.textContent = 'Ingestion complete!';
          if (progressPercent) progressPercent.textContent = '100%';
          if (progressBar) progressBar.style.width = '100%';
          es.close();
          activeEventSource = null;

          const resolvedRepoPath = payload.repo_path || payload.path || payload.local_path;
          if (resolvedRepoPath) {
            currentRepoSource = resolvedRepoPath;
            updateRepoSourceInfo();
          }

          // Workspace loading cycle trigger: load dynamic graph
          setTimeout(() => {
            if (progressContainer) progressContainer.style.display = 'none';
            // Trigger workspace loading cycle
            loadGraph();
            loadBranchesAndCommits();
          }, 1500);
        }
      } catch (err) {
        console.error('Error parsing SSE event data:', err);
      }
    };

    es.onerror = (err) => {
      console.error('SSE Error/Close:', err);
      // Under SSE, if server completes stream and closes, onerror triggers.
      // If we are closed or disconnected, we close event source to prevent infinite auto-reconnections.
      if (es.readyState === EventSource.CLOSED || es.readyState === EventSource.CONNECTING) {
        // SSE natively reconnects on some errors, but we can close it if the job is done or offline
        console.log('SSE connection closed or connecting. Active status:', es.readyState);
      }
    };
  }

  async function loadBranchesAndCommits(selectedBranch = null) {
    if (!currentRepoSource || service.demoMode) {
      return;
    }

    const branchSelector = document.getElementById('branchSelector');
    const commitTimelineRail = document.getElementById('commitTimelineRail');

    console.log(`loadBranchesAndCommits: Fetching for ${currentRepoSource}, branch: ${selectedBranch}`);

    try {
      let url = `${service.baseUrl}/repo/branches-and-commits?repo_path=${encodeURIComponent(currentRepoSource)}`;
      if (selectedBranch) {
        url += `&branch=${encodeURIComponent(selectedBranch)}`;
      }
      const resp = await service.safeFetch(url);
      const data = await resp.json();
      const branches = data.branches || [];
      const commits = data.commits || [];

      // 1. Populate branch dropdown
      if (branchSelector) {
        let activeBranch = selectedBranch || branchSelector.value;
        if (!activeBranch && branches.length > 0) {
          activeBranch = branches.includes('main') ? 'main' : (branches.includes('master') ? 'master' : branches[0]);
        }

        branchSelector.innerHTML = branches.map(b => {
          const selectedAttr = b === activeBranch ? ' selected' : '';
          return `<option value="${b}"${selectedAttr}>${b}</option>`;
        }).join('');
      }

      // 2. Populate commit timeline rail
      if (commitTimelineRail) {
        if (commits.length === 0) {
          commitTimelineRail.innerHTML = `<div style="padding: var(--space-sm); text-align: center; color: var(--theme-text-dim); font-size: 11px;">No commits found</div>`;
        } else {
          commitTimelineRail.innerHTML = commits.map(c => {
            const shortSha = c.sha ? c.sha.substring(0, 7) : '—';
            const author = c.author || 'Unknown';
            const dateStr = c.date ? new Date(c.date).toLocaleString() : '—';
            return `
              <div class="commit-card" data-sha="${c.sha}" style="padding: var(--space-sm); border: 1px solid var(--theme-border); border-radius: var(--radius-sm); background: var(--theme-surface-elevated); cursor: pointer; transition: all 150ms ease; display: flex; flex-direction: column; gap: 2px;">
                <div style="display: flex; justify-content: space-between; align-items: center; pointer-events: none;">
                  <span style="font-family: var(--font-mono); font-size: 11px; font-weight: 600; color: var(--theme-primary);">${shortSha}</span>
                  <span style="font-size: 10px; color: var(--theme-text-dim);">${dateStr}</span>
                </div>
                <div style="font-size: 11px; font-weight: 500; color: var(--theme-text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; pointer-events: none;">by ${author}</div>
              </div>
            `;
          }).join('');

          // 3. Bind click listeners to commit cards
          commitTimelineRail.querySelectorAll('.commit-card').forEach(card => {
            card.addEventListener('click', () => {
              commitTimelineRail.querySelectorAll('.commit-card').forEach(cc => {
                cc.style.borderColor = 'var(--theme-border)';
                cc.style.background = 'var(--theme-surface-elevated)';
              });
              card.style.borderColor = 'var(--theme-primary)';
              card.style.background = 'var(--theme-surface)';

              const sha = card.dataset.sha;
              console.log(`Commit card clicked. Selecting SHA: ${sha}`);
              service.currentCommitSHA = sha;

              // Trigger graph load and versioned file tree load
              loadGraph();
              loadVersionedFileTree(sha);
            });
          });
        }

        // Auto-load matching versioned file tree and load graph for latest commit on first load or branch change
        if (commits.length > 0) {
          const latestSHA = commits[0].sha;
          if (service.currentCommitSHA !== latestSHA) {
            service.currentCommitSHA = latestSHA;
            loadGraph();
            loadVersionedFileTree(latestSHA);
          } else {
            loadVersionedFileTree(latestSHA);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load branches and commits:', e);
    }
  }

  async function loadVersionedFileTree(commitSHA) {
    if (!commitSHA || service.demoMode) {
      return;
    }
    console.log(`loadVersionedFileTree: Fetching tree for version ${commitSHA}`);
    try {
      const resp = await service.safeFetch(`${service.baseUrl}/repo/tree?version=${encodeURIComponent(commitSHA)}`);
      const data = await resp.json();

      // Fallback retry: if specific commitSHA has no files (e.g. bitemporal disabled or empty DB snapshot), retry with 'latest'
      if ((!data || Object.keys(data).length === 0) && commitSHA !== 'latest') {
        console.log(`loadVersionedFileTree: Tree for ${commitSHA} is empty. Retrying fallback to 'latest'...`);
        try {
          const fallbackResp = await service.safeFetch(`${service.baseUrl}/repo/tree?version=latest`);
          const fallbackData = await fallbackResp.json();
          currentRepoTree = fallbackData;
        } catch (fallbackErr) {
          console.warn('Failed to load fallback latest file tree:', fallbackErr);
          currentRepoTree = data;
        }
      } else {
        currentRepoTree = data;
      }
      buildFileTree();
    } catch (e) {
      console.warn('Failed to load versioned file tree:', e);
    }
  }

  function updateRepoSourceInfo() {
    const sourceInfo = document.getElementById('repoSourceInfo');
    if (!sourceInfo) return;
    if (service.demoMode) {
      sourceInfo.textContent = 'Source: Demo project';
    } else if (currentRepoSource) {
      sourceInfo.textContent = `Source: ${currentRepoSource}`;
    } else if (currentRepoTree) {
      sourceInfo.textContent = 'Source: Local repository';
    } else {
      sourceInfo.textContent = `Source: ${service.baseUrl}`;
    }
  }

  function triggerOfflineMode(isOffline) {
    const banner = document.getElementById('offlineBanner');
    const statusEl = document.getElementById('serverStatus');
    const dotEl = document.getElementById('serverDot');

    if (isOffline) {
      service.connected = false;
      if (banner) banner.style.display = 'flex';
      if (statusEl) statusEl.textContent = 'Offline (Check Server)';
      if (dotEl) dotEl.style.background = 'var(--theme-danger)';
    } else {
      service.connected = true;
      if (banner) banner.style.display = 'none';
      if (statusEl) statusEl.textContent = 'Connected';
      if (dotEl) dotEl.style.background = 'var(--theme-success)';
    }
  }

  function createRepoTreeFromFiles(files) {
    const tree = {};
    Array.from(files).sort((a, b) => {
      const aPath = a.webkitRelativePath || a.name;
      const bPath = b.webkitRelativePath || b.name;
      return aPath.localeCompare(bPath);
    }).forEach(file => {
      const path = file.webkitRelativePath || file.name;
      const segments = path.split('/').filter(Boolean);
      let node = tree;
      segments.forEach((segment, index) => {
        const isFile = index === segments.length - 1;
        if (isFile) {
          node[segment] = { type: 'file', path };
        } else {
          node[segment] = node[segment] || { type: 'folder', children: {} };
          node = node[segment].children;
        }
      });
    });
    return tree;
  }

  function selectRepoFiles(files) {
    currentRepoTree = createRepoTreeFromFiles(files);
    currentRepoSource = 'Local repository';
    service.demoMode = false;
    service.graphData = null;
    updateRepoSourceInfo();
    buildFileTree();
    loadGraph();
  }

  function selectDemoProject() {
    currentRepoTree = null;
    currentRepoSource = 'Demo project';
    service.demoMode = true;
    service.graphData = null;
    updateRepoSourceInfo();
    loadGraph();
  }

  // === Details Panel Functions ===
  function showNodeDetails(node) {
    const data = node.data();
    const nodeId = data.id;
    const nodeInfo = nodeMap[nodeId];
    if (!nodeInfo) return;

    document.getElementById('detailName').textContent = nodeInfo.label;
    document.getElementById('detailType').textContent = 'Type: ' + nodeInfo.type;
    document.getElementById('detailFile').textContent = 'File: ' + (nodeInfo.file || 'src/' + nodeInfo.type + 's/' + nodeInfo.label + '.ts');
    document.getElementById('detailId').textContent = 'ID: ' + nodeInfo.id;

    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('detailsContent').style.display = 'block';

    const graphEdges = (service.graphData && service.graphData.edges) ? service.graphData.edges : [];

    const incoming = graphEdges.filter(e => e.target === nodeId);
    const impactList = document.getElementById('impactList');
    if (incoming.length === 0) {
      impactList.innerHTML = `<div class="details-panel__impact-item"><span class="mono" style="color:var(--theme-text-dim);">No dependents</span></div>`;
    } else {
      impactList.innerHTML = incoming.map(e => {
        const src = nodeMap[e.source];
        return `<div class="details-panel__impact-item">
                  <span class="mono">${src ? src.label : e.source}</span>
                  <span style="font-size:10px; color:var(--theme-text-dim);">(${e.type})</span>
                </div>`;
      }).join('');
    }

    const outgoing = graphEdges.filter(e => e.source === nodeId);
    const callPaths = document.getElementById('callPaths');
    if (outgoing.length === 0) {
      callPaths.innerHTML = `<span class="mono" style="color:var(--theme-text-dim);">No outgoing calls</span>`;
    } else {
      callPaths.innerHTML = outgoing.map(e => {
        const tgt = nodeMap[e.target];
        return `<div style="display:flex;align-items:center;gap:var(--space-sm);padding:2px 0;">
                  <span class="mono">→ ${tgt ? tgt.label : e.target}</span>
                  <span style="font-size:10px; color:var(--theme-text-dim);">(${e.type})</span>
                </div>`;
      }).join('');
    }

    document.getElementById('actionOpen').onclick = () => { alert('Open in editor: ' + nodeInfo.label); };
    document.getElementById('actionFind').onclick = () => { alert('Find references for: ' + nodeInfo.label); };
    document.getElementById('actionCopy').onclick = () => {
      navigator.clipboard?.writeText(nodeInfo.label).then(() => {
        alert('Copied: ' + nodeInfo.label);
      }).catch(() => {
        alert('Copy: ' + nodeInfo.label);
      });
    };
    document.getElementById('actionGenerateReq').onclick = () => {
      if (!selectedNodeIds.includes(nodeId)) {
        node.select();
        selectedNodeIds.push(nodeId);
        updateWorkspaceScope();
      }
      openRequirementsWorkspace();
    };
  }

  function showEmptyDetails() {
    document.getElementById('emptyState').style.display = 'flex';
    document.getElementById('detailsContent').style.display = 'none';
    document.getElementById('detailName').textContent = '—';
    document.getElementById('detailType').textContent = 'Select a node';
    document.getElementById('detailFile').textContent = '';
    document.getElementById('detailId').textContent = '';
  }

  // === Search ===
  function setupSearch() {
    const input = document.getElementById('searchInput');
    let timeout = null;
    input.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const query = input.value.trim().toLowerCase();
        if (!query || !cy) {
          cy.elements().style('opacity', 1);
          cy.elements().style('border-opacity', 1);
          return;
        }
        const nodes = cy.nodes();
        nodes.forEach(node => {
          const name = node.data('name') || '';
          const match = name.toLowerCase().includes(query);
          if (match) {
            node.style('opacity', 1);
            node.style('border-opacity', 1);
            node.style('border-width', 4);
            node.style('border-color', 'var(--theme-primary)');
          } else {
            node.style('opacity', 0.2);
            node.style('border-opacity', 0.2);
            node.style('border-width', 2);
            node.style('border-color', node.data('border-color'));
          }
        });
        cy.edges().style('opacity', 0.15);
        const matched = nodes.filter(n => (n.data('name') || '').toLowerCase().includes(query));
        if (matched.length > 0) {
          matched.forEach(m => m.connectedEdges().style('opacity', 0.8));
        }
      }, 150);
    });
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        input.focus();
        input.select();
      }
      if (e.key === 'Escape' && document.activeElement === input) {
        input.blur();
        input.value = '';
        input.dispatchEvent(new Event('input'));
      }
    });
  }

  // === Load File Graph ===
  async function loadFileGraph(commitSHA) {
    const sha = commitSHA || service.currentCommitSHA || 'latest';
    console.log(`loadFileGraph: Fetching file-level graph for version ${sha}`);

    const statusEl = document.getElementById('serverStatus');
    const dotEl = document.getElementById('serverDot');

    if (!service.connected) {
      try {
        const status = await service.connect();
        if (service.connected) {
          if (statusEl) statusEl.textContent = 'Connected';
          if (dotEl) dotEl.style.background = 'var(--theme-success)';
        } else {
          if (statusEl) statusEl.textContent = 'Offline (Check Server)';
          if (dotEl) dotEl.style.background = 'var(--theme-danger)';
        }
      } catch (e) {
        if (statusEl) statusEl.textContent = 'Offline (Check Server)';
        if (dotEl) dotEl.style.background = 'var(--theme-danger)';
        console.warn('Connection error:', e);
      }
    } else {
      if (statusEl) statusEl.textContent = 'Connected';
      if (dotEl) dotEl.style.background = 'var(--theme-success)';
    }

    if (cy && !service.connected) {
      console.log('Skipping Cytoscape re-render because app is offline and graph is already active.');
      return;
    }

    try {
      let url = `${service.baseUrl}/graph?version=${encodeURIComponent(sha)}&level=file`;
      const resp = await service.safeFetch(url);
      let graph = await resp.json();

      // Fallback retry: if specific version returns empty graph (e.g. bitemporal disabled or empty DB snapshot), retry with 'latest'
      if ((!graph || !graph.nodes || graph.nodes.length === 0) && sha !== 'latest') {
        console.log(`loadFileGraph: Graph for version ${sha} is empty. Retrying fallback to 'latest'...`);
        try {
          const fallbackUrl = `${service.baseUrl}/graph?version=latest&level=file`;
          const fallbackResp = await service.safeFetch(fallbackUrl);
          graph = await fallbackResp.json();
        } catch (fallbackErr) {
          console.warn('Failed to load fallback latest file graph:', fallbackErr);
        }
      }

      // Store graph data in service.graphData so details panel can access incoming/outgoing edges
      service.graphData = graph;

      // Render file-level nodes (directories, modules, and code files) and their edges
      const fileNodes = graph.nodes || [];
      const fileEdges = graph.edges || [];

      nodeMap = {};
      fileNodes.forEach(n => { nodeMap[n.id] = n; });

      document.getElementById('nodeCount').textContent = fileNodes.length + ' nodes';
      document.getElementById('edgeCount').textContent = fileEdges.length + ' edges';

      const splashEl = document.getElementById('graphSplash');
      if (splashEl) {
        if (fileNodes.length === 0) {
          splashEl.style.display = 'flex';
        } else {
          splashEl.style.display = 'none';
        }
      }

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const cyInstance = cytoscape({
        container: document.getElementById('cy'),
        elements: {
          nodes: fileNodes.map(n => ({
            data: { id: n.id, label: n.label, type: n.type, name: n.label },
            style: { 'background-color': `var(--node-${n.type})`, 'border-color': `var(--node-${n.type})` }
          })),
          edges: fileEdges.map(e => ({ data: { ...e, id: e.source + '-' + e.target } }))
        },
        style: [
          { selector: 'node', style: { 'width': '36px', 'height': '36px', 'border-width': 2, 'border-color': 'data(border-color)', 'border-opacity': 0.8, 'label': 'data(label)', 'font-size': '11px', 'font-family': "'Inter', -apple-system, sans-serif", 'color': isDark ? '#F0F6FC' : '#1F2328', 'text-valign': 'bottom', 'text-halign': 'center', 'text-outline-width': 2, 'text-outline-color': isDark ? '#0D1117' : '#FFFFFF', 'text-outline-opacity': 1, 'text-margin-y': 6, 'text-wrap': 'wrap', 'text-max-width': '60px' } },
          { selector: 'node:selected', style: { 'border-width': 4, 'border-color': 'var(--theme-primary)', 'border-opacity': 1, 'width': '44px', 'height': '44px', 'background-opacity': 0.9 } },
          { selector: 'edge', style: { 'width': 2, 'line-color': 'var(--edge-call)', 'target-arrow-color': 'var(--edge-call)', 'target-arrow-shape': 'triangle', 'source-arrow-shape': 'none', 'arrow-scale': 1.2, 'curve-style': 'bezier', 'label': 'data(type)', 'font-size': '9px', 'font-family': "'Inter', sans-serif", 'color': isDark ? '#8B949E' : '#656D76', 'text-outline-width': 1, 'text-outline-color': isDark ? '#0D1117' : '#FFFFFF', 'text-margin-y': -6, 'control-point-distance': 20, 'control-point-weight': 0.5 } },
          { selector: 'edge[type="imports"]', style: { 'line-style': 'dashed', 'line-color': 'var(--edge-import)', 'target-arrow-color': 'var(--edge-import)', 'width': 1.5 } }
        ],
        layout: {
          name: 'concentric',
          fit: true,
          padding: 40,
          startAngle: 3/2 * Math.PI,
          clockwise: true,
          equidistant: false,
          minNodeSpacing: 60,
          avoidOverlap: true,
          nodeDimensionsIncludeLabels: true
        },
        userZoomingEnabled: true,
        userPanningEnabled: true,
        boxSelectionEnabled: true,
        selectionType: 'additive',
        minZoom: 0.3,
        maxZoom: 4,
      });

      cy = cyInstance;
      window.cy = cyInstance;

      setupCyEvents();

      buildFileTree();
      showEmptyDetails();
      updateRepoSourceInfo();
      console.log('✅ File graph loaded with', fileNodes.length, 'nodes and', fileEdges.length, 'edges.');
    } catch (err) {
      console.warn('Failed to load file graph, falling back to empty graph:', err);
      nodeMap = {};
      document.getElementById('nodeCount').textContent = '0 nodes';
      document.getElementById('edgeCount').textContent = '0 edges';
      const splashEl = document.getElementById('graphSplash');
      if (splashEl) splashEl.style.display = 'flex';
    }
  }

  // === Filters ===
  function setupFilters() {
    const chips = document.querySelectorAll('.filter-chip');
    const legendRows = document.querySelectorAll('.legend__row.legend-filter');
    let activeType = 'all';

    const setActiveType = (type) => {
      activeType = type;
      chips.forEach(c => c.classList.toggle('filter-chip--active', c.dataset.type === type));
      legendRows.forEach(row => row.classList.toggle('legend-filter--active', row.dataset.type === type));
      applyFilter();
    };

    const applyFilter = () => {
      if (!cy) return;
      const nodes = cy.nodes();
      if (activeType === 'all') {
        nodes.style('opacity', 1);
        nodes.style('display', 'element');
        cy.edges().style('opacity', 1);
        cy.edges().style('display', 'element');
      } else {
        nodes.forEach(node => {
          const type = node.data('type');
          if (type === activeType) {
            node.style('opacity', 1);
            node.style('display', 'element');
          } else {
            node.style('opacity', 0.1);
            node.style('display', 'element');
          }
        });
        cy.edges().style('opacity', (edge) => {
          const src = edge.data('source');
          const tgt = edge.data('target');
          const srcVisible = cy.getElementById(src).style('opacity') !== 0.1;
          const tgtVisible = cy.getElementById(tgt).style('opacity') !== 0.1;
          return (srcVisible && tgtVisible) ? 1 : 0.1;
        });
      }
    };

    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        setActiveType(chip.dataset.type);
      });
    });

    legendRows.forEach(row => {
      row.addEventListener('click', () => {
        setActiveType(row.dataset.type);
      });
    });
  }

  // === Graph Controls ===
  function setupGraphControls() {
    document.getElementById('zoomInBtn').addEventListener('click', () => { if (cy) cy.zoom(cy.zoom() * 1.2); });
    document.getElementById('zoomOutBtn').addEventListener('click', () => { if (cy) cy.zoom(cy.zoom() / 1.2); });
    document.getElementById('fitBtn').addEventListener('click', () => { if (cy) cy.animate({ fit: { padding: 40 }, duration: 400 }); });
    document.getElementById('screenshotBtn').addEventListener('click', () => {
      if (cy) { const png = cy.png({ full: true }); const link = document.createElement('a'); link.download = 'code-intel-graph.png'; link.href = png; link.click(); }
    });
  }

  // === File Tree ===
  function buildFileTree() {
    console.log('buildFileTree: nodeMap size=', Object.keys(nodeMap || {}).length);
    const container = document.getElementById('fileTree');
    if (!container) return;

    const renderTree = (tree, depth = 0) => {
      let html = '';
      Object.keys(tree).sort().forEach((key) => {
        const item = tree[key];
        const indent = 8 + depth * 16;
        if (item.type === 'folder') {
          const folderId = `repo-folder-${depth}-${key}`.replace(/\W/g, '_');
          html += `<div class="file-tree__item file-tree__item--folder" style="padding-left:${indent}px;"><span class="file-tree__toggle" data-folder-name="${folderId}">▶</span><span class="file-tree__icon">📁</span><span>${key}/</span></div>`;
          html += `<div class="file-tree__children file-tree__children--collapsed" data-folder-children="${folderId}">`;
          html += renderTree(item.children, depth + 1);
          html += `</div>`;
        } else {
          const symbolsAttr = (item.symbols && Array.isArray(item.symbols)) ? item.symbols.join(',') : '';
          html += `<div class="file-tree__item file-tree__item--file" style="padding-left:${indent}px;" data-path="${item.path || ''}" data-symbols-list="${symbolsAttr}"><span class="file-tree__toggle" style="visibility:hidden;">▶</span><span class="file-tree__icon">📄</span><span>${key}</span></div>`;
        }
      });
      return html;
    };

    if (currentRepoTree && Object.keys(currentRepoTree).length > 0) {
      container.innerHTML = renderTree(currentRepoTree, 0);
    } else if (service.demoMode) {
      const folderMap = { 'auth': ['n1', 'n13'], 'user': ['n5', 'n18'], 'utils': ['n9', 'n11'], 'db': ['n7'], 'email': ['n16'], 'root': ['n20'] };
      let html = '';
      html += `<div class="file-tree__item file-tree__item--folder" style="padding-left:8px;"><span class="file-tree__toggle file-tree__toggle--expanded" data-folder-name="src">▶</span><span class="file-tree__icon">📂</span><span>src</span></div>`;
      html += `<div class="file-tree__children" data-folder-children="src">`;
      Object.keys(folderMap).forEach(folder => {
        if (folder === 'root') return;
        html += `<div class="file-tree__item file-tree__item--folder" style="padding-left:24px;"><span class="file-tree__toggle" data-folder-name="${folder}">▶</span><span class="file-tree__icon">📁</span><span>${folder}/</span></div>`;
        html += `<div class="file-tree__children file-tree__children--collapsed" data-folder-children="${folder}">`;
        folderMap[folder].forEach(id => {
          const node = nodeMap[id];
          if (node) {
            html += `<div class="file-tree__item file-tree__item--file" style="padding-left:40px;" data-node-id="${node.id}"><span class="file-tree__toggle" style="visibility:hidden;">▶</span><span class="file-tree__icon">📄</span><span>${node.label}.ts</span></div>`;
          }
        });
        html += `</div>`;
      });
      if (folderMap['root']) {
        folderMap['root'].forEach(id => {
          const node = nodeMap[id];
          if (node) {
            html += `<div class="file-tree__item file-tree__item--file" style="padding-left:24px;" data-node-id="${node.id}"><span class="file-tree__toggle" style="visibility:hidden;">▶</span><span class="file-tree__icon">📄</span><span>${node.label}.ts</span></div>`;
          }
        });
      }
      html += `</div>`;
      container.innerHTML = html;
    } else {
      container.innerHTML = `<div style="padding: var(--space-sm); text-align: center; color: var(--theme-text-dim); font-size: 11px;">No files found in repository tree</div>`;
    }

    container.querySelectorAll('.file-tree__toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const folderName = toggle.dataset.folderName;
        const children = container.querySelector(`[data-folder-children="${folderName}"]`);
        if (children) {
          const isCollapsed = children.classList.contains('file-tree__children--collapsed');
          if (isCollapsed) {
            children.classList.remove('file-tree__children--collapsed');
            toggle.classList.add('file-tree__toggle--expanded');
          } else {
            children.classList.add('file-tree__children--collapsed');
            toggle.classList.remove('file-tree__toggle--expanded');
          }
        }
      });
    });

    container.querySelectorAll('.file-tree__item--file').forEach(item => {
      item.addEventListener('click', () => {
        const nodeId = item.dataset.nodeId;
        const path = item.dataset.path;
        const symbolsList = item.dataset.symbolsList;
        if (nodeId && cy) {
          const el = cy.getElementById(nodeId);
          if (el && el.length) {
            cy.elements().unselect();
            el.select();
            showNodeDetails(el);
            cy.animate({ center: { eles: el }, zoom: 2.5, duration: 400 });
            return;
          }
        }
        if (path) {
          if (symbolsList) {
            alert(`Selected file: ${path}\n\nSymbols defined here:\n${symbolsList.split(',').join('\n')}`);
          } else {
            alert('Selected file: ' + path);
          }
        }
      });
    });
  }

  // === MCP Tools Display ===
  async function refreshMCPTools() {
    const toolsContainer = document.getElementById('mcpToolsList');
    const mcpDot = document.getElementById('mcpDot');
    const mcpStatus = document.getElementById('mcpStatus');

    try {
      const tools = await service.discoverMCPTools();
      if (tools.length > 0) {
        mcpDot.style.background = 'var(--theme-success)';
        mcpStatus.textContent = 'MCP: Connected (' + tools.length + ' tools)';
        toolsContainer.innerHTML = tools.map(t => 
          `<div style="padding:var(--space-xs) 0; border-bottom:1px solid var(--theme-border);">
            <strong style="font-size:12px;">${t.name}</strong>
            <div style="font-size:11px; color:var(--theme-text-dim);">${t.description || 'No description'}</div>
          </div>`
        ).join('');
      } else {
        mcpDot.style.background = 'var(--theme-warning)';
        mcpStatus.textContent = 'MCP: Connected (no tools)';
        toolsContainer.innerHTML = '<span style="color:var(--theme-text-dim);">No MCP tools discovered.</span>';
      }
    } catch {
      mcpDot.style.background = 'var(--theme-danger)';
      mcpStatus.textContent = 'MCP: Disconnected';
      toolsContainer.innerHTML = '<span style="color:var(--theme-text-dim);">MCP endpoint unreachable.</span>';
    }
  }

  // === Workspace Functions ===
  function updateWorkspaceScope() {
    const list = document.getElementById('selectedNodesList');
    const count = document.getElementById('scopeCount');
    if (selectedNodeIds.length === 0) {
      list.innerHTML = `<div style="color:var(--theme-text-dim); font-size:13px;">Select nodes in the graph using Shift+click or box selection.</div>`;
      count.textContent = '0 nodes';
      return;
    }
    count.textContent = selectedNodeIds.length + ' nodes';
    let html = `<div style="display:flex;flex-direction:column;gap:var(--space-xs);">`;
    selectedNodeIds.forEach(id => {
      const info = nodeMap[id];
      const label = info ? info.label : id;
      const type = info ? info.type : 'symbol';
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-xs) var(--space-sm);background:var(--theme-surface);border-radius:var(--radius-sm);border:1px solid var(--theme-border);"><span class="mono" style="font-size:12px;">${label}</span><span style="font-size:10px; color:var(--theme-text-dim);">${type}</span></div>`;
    });
    html += `</div>`;
    list.innerHTML = html;
  }

  function openRequirementsWorkspace() {
    document.getElementById('requirementsWorkspace').classList.add('open');
    updateWorkspaceScope();
    document.getElementById('workspaceStatus').textContent = 'Selected ' + selectedNodeIds.length + ' nodes. Click "Generate Requirements" to create documentation.';
  }

  function closeRequirementsWorkspace() {
    document.getElementById('requirementsWorkspace').classList.remove('open');
  }

  async function generateRequirements() {
    const status = document.getElementById('workspaceStatus');
    const output = document.getElementById('reqOutput');
    const matrixBody = document.getElementById('matrixBody');
    const generateBtn = document.getElementById('generateReqBtn');

    if (selectedNodeIds.length === 0) {
      status.textContent = '⚠️ Please select at least one node in the graph.';
      return;
    }

    const provider = localStorage.getItem('code-intel-llm-provider') || 'openai';
    let model = localStorage.getItem('code-intel-llm-model') || 'gpt-4';
    if (model === 'custom') {
      model = localStorage.getItem('code-intel-llm-custom-model') || '';
    }
    const apiKey = localStorage.getItem('code-intel-llm-key-' + provider);
    if (!apiKey) {
      status.textContent = '⚠️ API key not set for ' + provider + '. Please add your key in Settings.';
      return;
    }

    generateBtn.disabled = true;
    generateBtn.innerHTML = '<span class="spinner"></span> Generating...';
    status.textContent = 'Generating requirements using ' + model + '...';

    try {
      const commitSHA = service.currentCommitSHA || 'latest';
      
      // POST request to stream requirements chunk by chunk
      const response = await fetch(`${service.baseUrl}/requirements/stream?version=${encodeURIComponent(commitSHA)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          symbol_ids: selectedNodeIds
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      output.textContent = ''; // Clear initial instruction text

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep any partial line

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.substring(5).trim();
            if (!dataStr) continue;

            try {
              const parsed = JSON.parse(dataStr);

              if (parsed.token) {
                // Render incoming markdown chunks inside #reqOutput in real-time
                output.textContent += parsed.token;
                output.scrollTop = output.scrollHeight;
              }

              if (parsed.done === true) {
                // On stream completion, display grounded verification scores and populate Traceability Matrix table
                const isVerified = parsed.is_verified !== undefined ? parsed.is_verified : 'N/A';
                const confidence = parsed.confidence !== undefined ? parsed.confidence : 'N/A';

                status.textContent = `✅ Complete! Verification status: ${isVerified} (Confidence Score: ${confidence})`;

                const reqJson = parsed.req_json || {};
                const tasks = reqJson.tasks || [];
                let rows = '';

                tasks.forEach((task, idx) => {
                  const reqId = `REQ-${String(idx+1).padStart(3,'0')}`;
                  const traceList = task.traceability || [];
                  rows += `<tr>
                    <td><strong>${reqId}</strong></td>
                    <td>${task.text || 'Requirement details'}</td>
                    <td>${traceList.map(t => `<span class="node-ref" data-node-id="${t}" style="color:var(--theme-primary); cursor:pointer; font-family:var(--font-mono);">${t}</span>`).join(', ')}</td>
                  </tr>`;
                });

                if (!rows) {
                  rows = `<tr><td colspan="3" style="text-align:center; color:var(--theme-text-dim);">No traceability available.</td></tr>`;
                }
                matrixBody.innerHTML = rows;

                // Re-bind click listeners on the node references
                matrixBody.querySelectorAll('.node-ref').forEach(el => {
                  el.addEventListener('click', function() {
                    const nodeId = this.dataset.nodeId;
                    if (nodeId && cy) {
                      const node = cy.getElementById(nodeId);
                      if (node && node.length) {
                        cy.animate({ center: { eles: node }, zoom: 2.5, duration: 400 });
                        cy.elements().unselect();
                        node.select();
                        closeRequirementsWorkspace();
                      }
                    }
                  });
                });

                window._generatedReqDoc = output.textContent;
              }
            } catch (err) {
              console.warn("Failed to parse SSE JSON chunk:", err);
            }
          }
        }
      }
    } catch (e) {
      status.textContent = '❌ Error: ' + e.message;
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = '🚀 Generate Requirements';
    }
  }

  // === Settings Modal ===
  function setupSettingsModal() {
    const modal = document.getElementById('settingsModal');
    const openBtn = document.getElementById('settingsBtn');
    const closeBtn = document.getElementById('settingsModalClose');
    const cancelBtn = document.getElementById('settingsCancel');
    const saveBtn = document.getElementById('settingsSave');
    const testBtn = document.getElementById('settingsTestBtn');
    const testStatus = document.getElementById('settingsTestStatus');

    openBtn.addEventListener('click', () => {
      document.getElementById('settingsServerUrl').value = service.baseUrl;
      document.getElementById('settingsMcpUrl').value = service.mcpUrl;
      const storedProvider = localStorage.getItem('code-intel-llm-provider') || 'openai';
      const storedModel = localStorage.getItem('code-intel-llm-model') || 'gpt-4';
      const storedCustomModel = localStorage.getItem('code-intel-llm-custom-model') || '';
      document.getElementById('settingsProvider').value = storedProvider;
      document.getElementById('settingsLLM').value = storedModel;
      document.getElementById('settingsCustomModel').value = storedCustomModel;
      const storedKey = localStorage.getItem('code-intel-llm-key-' + storedProvider) || '';
      document.getElementById('settingsApiKey').value = storedKey ? '••••••••' : '';
      document.getElementById('settingsKeyStatus').textContent = storedKey ? 'Key saved' : 'Key not saved';
      document.getElementById('settingsCustomModelField').classList.toggle('modal__field--hidden', storedModel !== 'custom');

      // Reset test connection status
      if (testStatus) {
        testStatus.textContent = 'Ready to test. Click "Test Connection" to run diagnostics.';
        testStatus.style.borderColor = 'var(--theme-border)';
        testStatus.style.color = 'var(--theme-text-secondary)';
      }

      modal.classList.add('open');
    });

    if (testBtn) {
      testBtn.addEventListener('click', async () => {
        const testServerUrl = document.getElementById('settingsServerUrl').value.trim();
        const testMcpUrl = document.getElementById('settingsMcpUrl').value.trim();

        testStatus.innerHTML = '⚡ <strong>Running connection diagnostics...</strong>';
        testStatus.style.borderColor = 'var(--theme-primary)';
        testStatus.style.color = 'var(--theme-text-primary)';

        let diagnostics = [];
        let anyFailed = false;

        // 1. Validate URLs format
        if (!testServerUrl) {
          diagnostics.push('❌ Server URL cannot be empty.');
          anyFailed = true;
        } else {
          try {
            new URL(testServerUrl);
          } catch (e) {
            diagnostics.push(`❌ Server URL is invalid: ${e.message}`);
            anyFailed = true;
          }
        }

        if (!testMcpUrl) {
          diagnostics.push('❌ MCP Endpoint cannot be empty.');
          anyFailed = true;
        }

        if (anyFailed) {
          testStatus.innerHTML = diagnostics.join('\n');
          testStatus.style.borderColor = 'var(--theme-danger)';
          testStatus.style.color = 'var(--theme-danger)';
          return;
        }

        // 2. Test FastAPI Status endpoint
        try {
          diagnostics.push(`📡 Pinging API Server at: ${testServerUrl}/api/status ...`);
          testStatus.innerText = diagnostics.join('\n');

          let resp;
          try {
            resp = await fetch(`${testServerUrl}/api/status`, { signal: getTimeoutSignal(4000) });
          } catch (err) {
            // Fallback retry replacing localhost with 127.0.0.1
            if (testServerUrl.includes('localhost')) {
              const fallbackUrl = testServerUrl.replace('localhost', '127.0.0.1');
              diagnostics.push(`⚠️ localhost connection failed. Retrying with IPv4 loopback: ${fallbackUrl}/api/status ...`);
              testStatus.innerText = diagnostics.join('\n');
              resp = await fetch(`${fallbackUrl}/api/status`, { signal: getTimeoutSignal(4000) });
              diagnostics.push(`💡 Tip: localhost is unreachable. Consider updating Server URL to use 127.0.0.1 in Settings if localhost resolves to an inactive IPv6 loopback.`);
            } else {
              throw err;
            }
          }

          if (resp.ok) {
            const data = await resp.json();
            diagnostics.push(`✅ API Server is Online!\n   Version: ${data.version || 'unknown'}\n   Status: ${data.status || 'ready'}\n   Docker Mode: ${!!(data.is_docker || data.docker || data.dockerMode || data.docker_mode || data.environment === 'docker')}`);
          } else {
            diagnostics.push(`❌ API Server returned error: ${resp.status} ${resp.statusText}`);
            anyFailed = true;
          }
        } catch (e) {
          const isCors = /Failed to fetch|NetworkError|CORS|TypeError/i.test(e.message || String(e));
          if (isCors) {
            diagnostics.push(`❌ API Server unreachable (CORS or offline).\n   Ensure server is running on port 8000 and permits connections from 'tauri://localhost' or 'http://localhost'.`);
          } else {
            diagnostics.push(`❌ API Server connection failed: ${e.message || e}`);
          }
          anyFailed = true;
        }

        // 3. Test MCP Endpoint discovery info endpoint if valid URL schema
        if (service.canFetchUrl(testMcpUrl)) {
          try {
            diagnostics.push(`📡 Querying MCP Info at: ${testMcpUrl}/info ...`);
            testStatus.innerText = diagnostics.join('\n');

            const resp = await fetch(`${testMcpUrl}/info`, { signal: getTimeoutSignal(3000) });
            if (resp.ok) {
              const data = await resp.json();
              const numTools = (data.tools || []).length;
              diagnostics.push(`✅ MCP Server connected successfully! Discovered ${numTools} tools.`);
            } else {
              diagnostics.push(`⚠️ MCP Server returned error status: ${resp.status}. Please check backend configuration.`);
            }
          } catch (e) {
            diagnostics.push(`⚠️ MCP Server discovery failed: ${e.message || e}`);
          }
        } else {
          diagnostics.push(`ℹ️ MCP URL uses a non-HTTP protocol (${testMcpUrl}). Direct browser-based pre-test skipped.`);
        }

        testStatus.innerText = diagnostics.join('\n');
        if (anyFailed) {
          testStatus.style.borderColor = 'var(--theme-danger)';
          testStatus.style.color = 'var(--theme-danger)';
        } else {
          testStatus.style.borderColor = 'var(--theme-success)';
          testStatus.style.color = 'var(--theme-success)';
        }
      });
    }

    closeBtn.addEventListener('click', () => modal.classList.remove('open'));
    cancelBtn.addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });

    saveBtn.addEventListener('click', async () => {
      const serverUrl = document.getElementById('settingsServerUrl').value.trim();
      const mcpUrl = document.getElementById('settingsMcpUrl').value.trim();
      const provider = document.getElementById('settingsProvider').value;
      const model = document.getElementById('settingsLLM').value;
      const customModel = document.getElementById('settingsCustomModel').value.trim();
      let key = document.getElementById('settingsApiKey').value.trim();

      const finalModel = model === 'custom' ? customModel : model;
      let finalKey = key;
      if (key === '••••••••') {
        finalKey = localStorage.getItem('code-intel-llm-key-' + provider) || '';
      }

      // Locally update first
      if (serverUrl) {
        localStorage.setItem('code-intel-server-url', serverUrl);
        service.baseUrl = serverUrl;
      }
      if (mcpUrl) {
        localStorage.setItem('code-intel-mcp-url', mcpUrl);
        service.mcpUrl = mcpUrl;
      }
      localStorage.setItem('code-intel-llm-provider', provider);
      localStorage.setItem('code-intel-llm-model', model);
      if (model === 'custom') {
        localStorage.setItem('code-intel-llm-custom-model', customModel);
      }
      if (key && key !== '••••••••') {
        localStorage.setItem('code-intel-llm-key-' + provider, key);
      }

      // Synchronize dynamically with backend /config/llm
      try {
        const resp = await service.safeFetch(`${service.baseUrl}/config/llm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Transient-Memory-Only': 'true',
            'Cache-Control': 'no-store',
            'Pragma': 'no-cache'
          },
          body: JSON.stringify({
            provider: provider,
            model: finalModel,
            api_key: finalKey,
            session_id: "default"
          })
        });
        if (!resp.ok) {
          throw new Error(`HTTP error ${resp.status}`);
        }
        console.log('LLM credentials synchronized successfully with backend.');
      } catch (err) {
        console.warn('Backend LLM Settings Sync Handshake failed:', err);
        alert(`⚠️ Warning: Failed to sync LLM credentials with backend. Local settings have been saved, but dynamic LLM operations on the backend might fail until connection is restored.\n\nError: ${err.message || err}`);
      }

      modal.classList.remove('open');
      loadGraph();
      refreshMCPTools(); // Refresh MCP tools after save
    });

    const providerSelect = document.getElementById('settingsProvider');
    const modelSelect = document.getElementById('settingsLLM');
    const customModelField = document.getElementById('settingsCustomModelField');

    modelSelect.addEventListener('change', () => {
      customModelField.classList.toggle('modal__field--hidden', modelSelect.value !== 'custom');
    });

    providerSelect.addEventListener('change', () => {
      const provider = providerSelect.value;
      const storedKey = localStorage.getItem('code-intel-llm-key-' + provider) || '';
      document.getElementById('settingsApiKey').value = storedKey ? '••••••••' : '';
      document.getElementById('settingsKeyStatus').textContent = storedKey ? 'Key saved' : 'Key not saved';
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) {
        modal.classList.remove('open');
      }
    });
  }

  // === Setup Cytoscape Events ===
  function setupCyEvents() {
    if (!cy) return;

    cy.on('select', 'node', function(evt) {
      const node = evt.target;
      if (!selectedNodeIds.includes(node.id())) {
        selectedNodeIds.push(node.id());
      }
      updateWorkspaceScope();
      if (selectedNodeIds.length === 1) {
        showNodeDetails(node);
      } else {
        document.getElementById('detailName').textContent = selectedNodeIds.length + ' nodes selected';
        document.getElementById('detailType').textContent = 'Multi-select mode';
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('detailsContent').style.display = 'block';
        document.getElementById('impactList').innerHTML = `<div class="details-panel__impact-item"><span class="mono">${selectedNodeIds.length} nodes in scope</span></div>`;
        document.getElementById('callPaths').innerHTML = `<span class="mono">Use the Requirements Workspace to generate documentation for this selection.</span>`;
      }
    });

    cy.on('unselect', 'node', function(evt) {
      const node = evt.target;
      const idx = selectedNodeIds.indexOf(node.id());
      if (idx > -1) {
        selectedNodeIds.splice(idx, 1);
      }
      updateWorkspaceScope();
      if (selectedNodeIds.length === 0) {
        showEmptyDetails();
      } else if (selectedNodeIds.length === 1) {
        const el = cy.getElementById(selectedNodeIds[0]);
        if (el && el.length) showNodeDetails(el);
      }
    });

    cy.on('tap', function(evt) {
      if (evt.target === cy) {
        cy.elements().unselect();
        selectedNodeIds = [];
        updateWorkspaceScope();
        showEmptyDetails();
      }
    });

    cy.on('dbltap', 'node', async function(evt) {
      const node = evt.target;
      if (node.data('type') !== 'file') return;

      const parentId = node.id();
      const path = parentId.startsWith('file:') ? parentId.substring(5) : parentId;
      const commitSHA = service.currentCommitSHA || 'latest';

      console.log(`Double-clicked file node: ${path}. Expanding symbols...`);

      try {
        const resp = await service.safeFetch(`${service.baseUrl}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rule: 'get_symbols',
            commit_sha: commitSHA,
            file_path: path
          })
        });
        const data = await resp.json();
        const symbols = data.result || [];

        console.log(`Found ${symbols.length} symbols in ${path}`);

        if (symbols.length === 0) {
          alert(`No symbols found in ${path}`);
          return;
        }

        // Add symbol nodes as children
        symbols.forEach(symbol => {
          const symId = symbol.id || symbol.fqn;
          if (!cy.getElementById(symId).length) {
            cy.add({
              group: 'nodes',
              data: {
                id: symId,
                label: symbol.name || symId.split('.').pop(),
                type: symbol.kind || 'symbol',
                name: symbol.name || symId.split('.').pop(),
                parent: parentId
              },
              style: {
                'background-color': `var(--node-${symbol.kind || 'symbol'})`,
                'border-color': `var(--node-${symbol.kind || 'symbol'})`
              }
            });

            nodeMap[symId] = {
              id: symId,
              label: symbol.name || symId.split('.').pop(),
              type: symbol.kind || 'symbol',
              file: symbol.file || path
            };
          }
        });

        // Query detailed graph to find calls and imports dependencies
        const graphResp = await service.safeFetch(`${service.baseUrl}/graph?version=${encodeURIComponent(commitSHA)}&level=all`);
        const fullGraph = await graphResp.json();

        // Add edges connecting any of the visible symbol nodes
        let edgesAdded = 0;
        fullGraph.edges.forEach(edge => {
          const edgeId = edge.source + '-' + edge.target;
          if (cy.getElementById(edge.source).length && cy.getElementById(edge.target).length && !cy.getElementById(edgeId).length) {
            cy.add({
              group: 'edges',
              data: {
                id: edgeId,
                source: edge.source,
                target: edge.target,
                type: edge.type || 'calls'
              }
            });
            edgesAdded++;
          }
        });

        console.log(`Added ${edgesAdded} dependencies edges.`);

        // Re-run the layout to place the new compound child nodes and edges beautifully
        cy.layout({
          name: 'concentric',
          fit: true,
          padding: 40,
          avoidOverlap: true,
          nodeDimensionsIncludeLabels: true
        }).run();

        // Update statistics counters
        document.getElementById('nodeCount').textContent = cy.nodes().length + ' nodes';
        document.getElementById('edgeCount').textContent = cy.edges().length + ' edges';

      } catch (err) {
        console.error('Failed to expand symbols:', err);
        alert('Failed to expand symbols: ' + err.message);
      }
    });
  }

  // === Load Graph ===
  async function loadGraph() {
    if (!service.demoMode) {
      await loadFileGraph(service.currentCommitSHA);
      return;
    }

    const statusEl = document.getElementById('serverStatus');
    const dotEl = document.getElementById('serverDot');

    if (!service.connected) {
      try {
        const status = await service.connect();
        if (service.connected) {
          if (statusEl) statusEl.textContent = 'Connected';
          if (dotEl) dotEl.style.background = 'var(--theme-success)';
        } else {
          if (statusEl) statusEl.textContent = 'Offline (Check Server)';
          if (dotEl) dotEl.style.background = 'var(--theme-danger)';
        }
      } catch (e) {
        if (statusEl) statusEl.textContent = 'Offline (Check Server)';
        if (dotEl) dotEl.style.background = 'var(--theme-danger)';
        console.warn('Connection error:', e);
      }
    } else {
      if (statusEl) statusEl.textContent = 'Connected';
      if (dotEl) dotEl.style.background = 'var(--theme-success)';
    }

    // Do not clear the active Cytoscape canvas elements. Allow the developer to continue in offline mode.
    if (cy && !service.connected) {
      console.log('Skipping Cytoscape re-render because app is offline and graph is already active.');
      return;
    }

    const graph = await service.getGraph();
    nodeMap = {};
    graph.nodes.forEach(n => { nodeMap[n.id] = n; });

    document.getElementById('nodeCount').textContent = graph.nodes.length + ' nodes';
    document.getElementById('edgeCount').textContent = graph.edges.length + ' edges';

    const splashEl = document.getElementById('graphSplash');
    if (splashEl) {
      if (graph.nodes.length === 0) {
        splashEl.style.display = 'flex';
      } else {
        splashEl.style.display = 'none';
      }
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const cyInstance = cytoscape({
      container: document.getElementById('cy'),
      elements: {
        nodes: graph.nodes.map(n => ({
          data: { id: n.id, label: n.label, type: n.type, name: n.label },
          style: { 'background-color': `var(--node-${n.type})`, 'border-color': `var(--node-${n.type})` }
        })),
        edges: graph.edges.map(e => ({ data: { ...e, id: e.source + '-' + e.target } }))
      },
      style: [
        { selector: 'node', style: { 'width': '36px', 'height': '36px', 'border-width': 2, 'border-color': 'data(border-color)', 'border-opacity': 0.8, 'label': 'data(label)', 'font-size': '11px', 'font-family': "'Inter', -apple-system, sans-serif", 'color': isDark ? '#F0F6FC' : '#1F2328', 'text-valign': 'bottom', 'text-halign': 'center', 'text-outline-width': 2, 'text-outline-color': isDark ? '#0D1117' : '#FFFFFF', 'text-outline-opacity': 1, 'text-margin-y': 6, 'text-wrap': 'wrap', 'text-max-width': '60px' } },
        { selector: 'node:selected', style: { 'border-width': 4, 'border-color': 'var(--theme-primary)', 'border-opacity': 1, 'width': '44px', 'height': '44px', 'background-opacity': 0.9 } },
        { selector: 'edge', style: { 'width': 2, 'line-color': 'var(--edge-call)', 'target-arrow-color': 'var(--edge-call)', 'target-arrow-shape': 'triangle', 'source-arrow-shape': 'none', 'arrow-scale': 1.2, 'curve-style': 'bezier', 'label': 'data(type)', 'font-size': '9px', 'font-family': "'Inter', sans-serif", 'color': isDark ? '#8B949E' : '#656D76', 'text-outline-width': 1, 'text-outline-color': isDark ? '#0D1117' : '#FFFFFF', 'text-margin-y': -6, 'control-point-distance': 20, 'control-point-weight': 0.5 } },
        { selector: 'edge[type="imports"]', style: { 'line-style': 'dashed', 'line-color': 'var(--edge-import)', 'target-arrow-color': 'var(--edge-import)', 'width': 1.5 } }
      ],
      layout: { name: 'cose', idealEdgeLength: 100, nodeRepulsion: 8000, nestingFactor: 1.2, gravity: 0.3, numIter: 1000, refresh: 20, fit: true, padding: 40 },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: true,
      selectionType: 'additive',
      minZoom: 0.3,
      maxZoom: 4,
    });

    cy = cyInstance;
    window.cy = cyInstance;

    setupCyEvents();

    buildFileTree();
    showEmptyDetails();
    updateRepoSourceInfo();
    console.log('✅ Graph loaded with', graph.nodes.length, 'nodes and', graph.edges.length, 'edges.');
  }

  // === Workspace Event Handlers ===
  function setupWorkspace() {
    const modal = document.getElementById('requirementsWorkspace');
    document.getElementById('workspaceClose').addEventListener('click', closeRequirementsWorkspace);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeRequirementsWorkspace();
    });
    document.getElementById('generateReqBtn').addEventListener('click', generateRequirements);
    document.getElementById('clearScopeBtn').addEventListener('click', () => {
      if (cy) cy.elements().unselect();
      selectedNodeIds = [];
      updateWorkspaceScope();
      document.getElementById('reqOutput').textContent = 'Requirements document will appear here after generation.';
      document.getElementById('matrixBody').innerHTML = `<tr><td colspan="3" style="text-align:center; padding:var(--space-lg); color:var(--theme-text-dim);">No requirements generated yet.</td></tr>`;
      window._generatedReqDoc = null;
    });
    document.getElementById('copyReqBtn').addEventListener('click', () => {
      const doc = window._generatedReqDoc;
      if (!doc) { document.getElementById('workspaceStatus').textContent = '⚠️ No generated document to copy.'; return; }
      navigator.clipboard?.writeText(doc).then(() => {
        document.getElementById('workspaceStatus').textContent = '✅ Copied to clipboard!';
      }).catch(() => {
        const out = document.getElementById('reqOutput');
        const range = document.createRange();
        range.selectNode(out);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        document.execCommand('copy');
        window.getSelection().removeAllRanges();
        document.getElementById('workspaceStatus').textContent = '✅ Copied!';
      });
    });
    document.getElementById('downloadReqBtn').addEventListener('click', () => {
      const doc = window._generatedReqDoc;
      if (!doc) { document.getElementById('workspaceStatus').textContent = '⚠️ No generated document to download.'; return; }
      const blob = new Blob([doc], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'requirements.md';
      a.click();
      URL.revokeObjectURL(url);
      document.getElementById('workspaceStatus').textContent = '✅ Downloaded as requirements.md';
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) {
        closeRequirementsWorkspace();
      }
    });
  }

  // === Splitter (Resizable Panes) ===
  function enableSplitter() {
    const container = document.querySelector('.main-area');
    const left = document.querySelector('.left-pane');
    const splitter = document.querySelector('.splitter');
    const right = document.querySelector('.right-pane');
    if (!container || !left || !splitter || !right) return;

    // initial width from localStorage
    const saved = localStorage.getItem('split-left-width');
    if (saved) {
      const width = parseInt(saved, 10);
      if (!Number.isNaN(width)) {
        container.style.gridTemplateColumns = `${width}px 12px minmax(0, 1fr)`;
      }
    }

    let dragging = false;
    let startX = 0;
    let startWidth = 0;
    const min = 200;
    const max = () => Math.max(240, container.clientWidth - 320);

    const onPointerDown = (e) => {
      console.log('splitter: pointerdown');
      dragging = true;
      startX = (e.clientX ?? (e.touches && e.touches[0] && e.touches[0].clientX)) || 0;
      startWidth = left.getBoundingClientRect().width;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      try { if (e.pointerId && splitter.setPointerCapture) splitter.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('mousemove', onPointerMove);
      window.addEventListener('mouseup', onPointerUp);
      window.addEventListener('touchmove', onPointerMove, { passive: false });
      window.addEventListener('touchend', onPointerUp);
    };

    const onPointerMove = (e) => {
      if (!dragging) return;
      if (e.cancelable) e.preventDefault();
      const clientX = (e.clientX ?? (e.touches && e.touches[0] && e.touches[0].clientX)) || 0;
      console.log('splitter: pointermove', clientX, startX, dragging);
      const dx = clientX - startX;
      let newWidth = Math.round(startWidth + dx);
      newWidth = Math.max(min, Math.min(newWidth, max()));
      left.style.width = `${newWidth}px`;
      container.style.gridTemplateColumns = `${newWidth}px 12px minmax(0, 1fr)`;
    };

    const onPointerUp = (e) => {
      if (!dragging) return;
      dragging = false;
      const width = left.getBoundingClientRect().width;
      localStorage.setItem('split-left-width', Math.round(width));
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { if (e && e.pointerId && splitter.releasePointerCapture) splitter.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
    };

    splitter.addEventListener('pointerdown', onPointerDown);
    splitter.addEventListener('touchstart', onPointerDown, { passive: false });

    // keyboard accessibility
    splitter.addEventListener('keydown', (e) => {
      const step = 20;
      const leftWidth = left.getBoundingClientRect().width;
      let w = leftWidth;
      if (e.key === 'ArrowLeft') {
        w = Math.max(min, leftWidth - step);
      } else if (e.key === 'ArrowRight') {
        w = Math.min(max(), leftWidth + step);
      }
      if (w !== leftWidth) {
        container.style.gridTemplateColumns = `${w}px 12px minmax(0, 1fr)`;
        localStorage.setItem('split-left-width', Math.round(w));
      }
    });

    window.addEventListener('resize', () => {
      const leftWidth = left.getBoundingClientRect().width;
      if (leftWidth > max()) {
        const w = Math.max(min, max());
        left.style.width = w + 'px';
        localStorage.setItem('split-left-width', Math.round(w));
      }
    });
  }

  function enableRightSplitter() {
    const rightPane = document.querySelector('.right-pane');
    const splitter = document.querySelector('.splitter--vertical');
    if (!rightPane || !splitter) return;

    const graph = rightPane.querySelector('.graph-viewer');
    const details = rightPane.querySelector('.details-panel');
    if (!graph || !details) return;

    const saved = localStorage.getItem('split-right-width');
    if (saved) {
      const width = parseInt(saved, 10);
      if (!Number.isNaN(width)) {
        rightPane.style.gridTemplateColumns = `minmax(0, 1fr) 12px ${width}px`;
      }
    }

    let dragging = false;
    let startX = 0;
    let startWidth = 0;
    const min = 240;
    const max = () => Math.max(240, rightPane.clientWidth - 240);

    const onPointerDown = (e) => {
      dragging = true;
      startX = (e.clientX ?? (e.touches && e.touches[0] && e.touches[0].clientX)) || 0;
      startWidth = details.getBoundingClientRect().width;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      try { if (e.pointerId && splitter.setPointerCapture) splitter.setPointerCapture(e.pointerId); } catch (err) { }
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('mousemove', onPointerMove);
      window.addEventListener('mouseup', onPointerUp);
      window.addEventListener('touchmove', onPointerMove, { passive: false });
      window.addEventListener('touchend', onPointerUp);
    };

    const onPointerMove = (e) => {
      if (!dragging) return;
      if (e.cancelable) e.preventDefault();
      const clientX = (e.clientX ?? (e.touches && e.touches[0] && e.touches[0].clientX)) || 0;
      const dx = startX - clientX;
      let newWidth = Math.round(startWidth + dx);
      newWidth = Math.max(min, Math.min(newWidth, max()));
      details.style.width = `${newWidth}px`;
      rightPane.style.gridTemplateColumns = `minmax(0, 1fr) 12px ${newWidth}px`;
    };

    const onPointerUp = (e) => {
      if (!dragging) return;
      dragging = false;
      const width = details.getBoundingClientRect().width;
      localStorage.setItem('split-right-width', Math.round(width));
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { if (e && e.pointerId && splitter.releasePointerCapture) splitter.releasePointerCapture(e.pointerId); } catch (err) { }
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
    };

    splitter.addEventListener('pointerdown', onPointerDown);
    splitter.addEventListener('touchstart', onPointerDown, { passive: false });
  }

  // === Manual Reconnection / Retry Logic ===
  async function performReconnectionRetry() {
    const retryBtn = document.getElementById('offlineRetryBtn');
    if (retryBtn) {
      retryBtn.disabled = true;
      retryBtn.textContent = '🔄 Retrying...';
    }

    try {
      const data = await service.connect();
      if (service.connected) {
        triggerOfflineMode(false);
        // Refresh graph data and timeline
        loadGraph();
        loadBranchesAndCommits();
      } else {
        triggerOfflineMode(true);
        console.warn('Manual reconnection retry failed.');
      }
    } catch (e) {
      triggerOfflineMode(true);
      console.warn('Manual reconnection retry failed with error:', e);
    } finally {
      if (retryBtn) {
        retryBtn.disabled = false;
        retryBtn.textContent = '🔄 Retry Connection';
      }
    }
  }

  // === Initialization ===
  document.addEventListener('DOMContentLoaded', () => {
    const theme = getPreferredTheme();
    setTheme(theme);
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('code-intel-theme')) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    });

    // Wire up offline banner action buttons
    const offlineRetryBtn = document.getElementById('offlineRetryBtn');
    if (offlineRetryBtn) {
      offlineRetryBtn.addEventListener('click', () => {
        performReconnectionRetry();
      });
    }

    const offlineSettingsBtn = document.getElementById('offlineSettingsBtn');
    if (offlineSettingsBtn) {
      offlineSettingsBtn.addEventListener('click', () => {
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
          settingsBtn.click();
        }
      });
    }
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        toggleTheme();
      }
    });

    setupSearch();
    setupFilters();
    setupGraphControls();
    setupSettingsModal();
    setupWorkspace();
    document.getElementById('browseRepoBtn').addEventListener('click', async () => {
      const isTauri = typeof window !== 'undefined' && window.TAURI && window.TAURI.dialog;
      const dockerMode = localStorage.getItem('dockerMode') === 'true';

      let absolutePath = null;

      if (isTauri) {
        try {
          // Open Tauri's native directory picker dialog
          const selectedPath = await window.TAURI.dialog.open({
            directory: true,
            multiple: false
          });

          if (selectedPath) {
            // Under single select directory: true, selectedPath will be a string
            absolutePath = Array.isArray(selectedPath) ? selectedPath[0] : selectedPath;
          }
        } catch (e) {
          console.error('Tauri native dialog failed:', e);
          alert('Failed to open native dialog: ' + e.message);
          return;
        }
      } else {
        // Fallback for standard browsers in development / testing environments
        const prompted = prompt('Browser environment detected (Non-Tauri). Enter the absolute system path to analyze:');
        if (prompted && prompted.trim()) {
          absolutePath = prompted.trim();
        }
      }

      if (!absolutePath) {
        return;
      }

      // If dockerMode is active, check the path translation or prompt user
      if (dockerMode) {
        // Shared Docker mount path rule (typically /shared or similar)
        const isShared = absolutePath.startsWith('/shared') || absolutePath.startsWith('\\shared');
        if (!isShared) {
          const confirmAnalysis = confirm(
            `⚠️ [Docker Mode Active] The selected path "${absolutePath}" might not be accessible inside the container.\n\nBackend is running inside a Docker container. Ensure this directory is mounted/accessible (e.g. under "/shared").\n\nDo you still want to proceed?`
          );
          if (!confirmAnalysis) {
            return;
          }
        }
      }

      // Fire a POST /analyze request to backend carrying the absolute path
      const browseBtn = document.getElementById('browseRepoBtn');
      browseBtn.disabled = true;
      const originalText = browseBtn.textContent;
      browseBtn.textContent = 'Analyzing...';

      // Instantly clear demo project context on click
      currentRepoTree = null;
      currentRepoSource = absolutePath;
      service.demoMode = false;
      service.graphData = null; // Clear old local graph
      updateRepoSourceInfo();
      buildFileTree();
      loadGraph();

      try {
        const resp = await service.safeFetch(`${service.baseUrl}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repo_path: absolutePath })
        });

        const data = await resp.json();
        console.log('Absolute path analysis triggered successfully:', data);
        alert(`Analysis triggered successfully!\nSelected path: ${absolutePath}`);

        const resolvedRepoPath = data.repo_path || data.path || data.local_path || absolutePath;
        currentRepoSource = resolvedRepoPath;
        updateRepoSourceInfo();

        if (data.job_id) {
          subscribeToIngestionStream(data.job_id);
        } else {
          loadGraph();
          loadBranchesAndCommits();
        }
      } catch (e) {
        console.error('Failed to analyze absolute path:', e);
        alert('Failed to analyze path. Error: ' + e.message);
      } finally {
        browseBtn.disabled = false;
        browseBtn.textContent = originalText;
      }
    });
    document.getElementById('demoProjectBtn').addEventListener('click', () => {
      selectDemoProject();
    });
    document.getElementById('cloneRemoteBtn').addEventListener('click', async () => {
      const urlInput = document.getElementById('remoteRepoUrlInput');
      const branchInput = document.getElementById('remoteRepoBranchInput');
      const cloneBtn = document.getElementById('cloneRemoteBtn');

      const url = urlInput.value.trim();
      const branch = branchInput.value.trim();

      if (!url) {
        alert('Please enter a remote Git URL.');
        return;
      }

      // Basic Git URL syntax validation (matches https, http, git, or ssh pathways)
      const gitRegex = /^(https?:\/\/|git@|ssh:\/\/|git:\/\/|git\+ssh:\/\/)[a-zA-Z0-9_\-\.\~\/:]+(?:\.git)?\/?$/;
      if (!gitRegex.test(url)) {
        alert('Invalid Git URL format. Please enter a valid HTTP, HTTPS, or SSH Git pathway.');
        return;
      }

      // Enter active ingestion state
      cloneBtn.disabled = true;
      cloneBtn.textContent = 'Ingesting...';

      // Instantly clear demo project context on click
      currentRepoTree = null;
      currentRepoSource = url;
      service.demoMode = false;
      service.graphData = null; // Clear old local graph
      updateRepoSourceInfo();
      buildFileTree();
      loadGraph();

      try {
        const payload = { repo_path: url };
        if (branch) {
          payload.branch = branch;
        }

        const resp = await service.safeFetch(`${service.baseUrl}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await resp.json();
        console.log('Ingestion triggered successfully:', data);
        alert(`Ingestion triggered successfully! Job ID: ${data.job_id || 'started'}`);

        const resolvedRepoPath = data.repo_path || data.path || data.local_path || url;
        currentRepoSource = resolvedRepoPath;
        updateRepoSourceInfo();

        if (data.job_id) {
          subscribeToIngestionStream(data.job_id);
        } else {
          loadGraph();
          loadBranchesAndCommits();
        }
      } catch (e) {
        console.error('Remote ingestion failed:', e);
        alert('Failed to trigger remote ingestion. Error: ' + e.message);
      } finally {
        cloneBtn.disabled = false;
        cloneBtn.textContent = 'Clone & Ingest';
      }
    });
    document.getElementById('repoFileInput').addEventListener('change', (event) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        selectRepoFiles(files);
      }
    });

    const branchSelector = document.getElementById('branchSelector');
    if (branchSelector) {
      branchSelector.addEventListener('change', () => {
        const val = branchSelector.value;
        console.log(`Branch changed to: ${val}`);
        loadBranchesAndCommits(val);
      });
    }

    loadGraph();
    refreshMCPTools(); // Also refresh MCP tools on load
    enableSplitter();
    enableRightSplitter();
    updateRepoSourceInfo();

    // Periodic health check of FastAPI backend (every 10 seconds if offline, 30 seconds if online)
    let lastHealthCheckTime = Date.now();
    setInterval(async () => {
      const now = Date.now();
      const interval = service.connected ? 30000 : 10000;
      if (now - lastHealthCheckTime < interval) {
        return;
      }

      // Skip status polling if there's an active SSE ingestion stream
      if (service.connected && activeEventSource) {
        return;
      }

      lastHealthCheckTime = now;
      try {
        const resp = await service.safeFetch(`${service.baseUrl}/api/status`, { signal: getTimeoutSignal(3000) });
        if (resp.ok) {
          const data = await resp.json();
          // If recovered, dismiss the banner and update the status bar
          triggerOfflineMode(false);

          // Keep dockerMode in sync
          if (data && (data.is_docker === true || data.docker === true || data.dockerMode === true || data.docker_mode === true || data.environment === 'docker')) {
            localStorage.setItem('dockerMode', 'true');
          } else {
            localStorage.setItem('dockerMode', 'false');
          }
        } else {
          if (resp.status === 502 || resp.status === 503) {
            triggerOfflineMode(true);
          }
        }
      } catch (e) {
        // Remain or transition to offline
        console.warn('Backend health check error:', e.message || e);
        triggerOfflineMode(true);
      }
    }, 5000);

    // Periodic health check (every 30 seconds)
    setInterval(() => {
      refreshMCPTools();
    }, 30000);
  });
})();
