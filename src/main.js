// Debug: confirm this script is loaded in the browser console
console.log('main.js loaded');

(function() {
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
      this.baseUrl = localStorage.getItem('code-intel-server-url') || 'http://localhost:8080';
      this.mcpUrl = localStorage.getItem('code-intel-mcp-url') || 'mcp://localhost:8080';
      this.connected = false;
      this.mcpConnected = false;
      this.graphData = null;
      this.mcpTools = [];
    }

    async connect() {
      try {
        const resp = await fetch(`${this.baseUrl}/api/status`, { signal: AbortSignal.timeout(3000) });
        if (!resp.ok) throw new Error('Server unreachable');
        const data = await resp.json();
        this.connected = true;
        this.connectError = null;
        return data;
      } catch (e) {
        this.connected = false;
        this.connectError = e.message || String(e);
        console.warn('Fallback to mock data. Server error:', this.connectError);
        return { status: 'mock', version: '0.0.0', index: 'ready' };
      }
    }

    async getGraph() {
      if (this.graphData) return this.graphData;
      try {
        const resp = await fetch(`${this.baseUrl}/api/graph`);
        if (!resp.ok) throw new Error('Graph fetch failed');
        this.graphData = await resp.json();
        return this.graphData;
      } catch (e) {
        console.warn('Using mock graph data');
        this.graphData = {
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
        return this.graphData;
      }
    }

    // === LLM Requirements Generation ===
    async generateRequirements(nodeIds, context, provider, model) {
      try {
        const resp = await fetch(`${this.baseUrl}/api/llm/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodeIds, context, provider, model })
        });
        if (!resp.ok) throw new Error('LLM generation failed');
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

    // === MCP Discovery ===
    async getMCPInfo() {
      if (!this.canFetchUrl(this.mcpUrl)) {
        console.warn('Skipping MCP discovery: unsupported protocol for browser fetch:', this.mcpUrl);
        this.mcpConnected = false;
        this.mcpTools = [];
        return { tools: [] };
      }

      try {
        const resp = await fetch(`${this.mcpUrl}/info`, { signal: AbortSignal.timeout(2000) });
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

    const incoming = service.graphData.edges.filter(e => e.target === nodeId);
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

    const outgoing = service.graphData.edges.filter(e => e.source === nodeId);
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
    if (!container || !service.graphData) return;
    const folderMap = { 'auth': ['n1', 'n13'], 'user': ['n5', 'n18'], 'utils': ['n9', 'n11'], 'db': ['n7'], 'email': ['n16'], 'root': ['n20'] };
    let treeHtml = `<div class="file-tree__item file-tree__item--folder" style="padding-left:8px;"><span class="file-tree__toggle file-tree__toggle--expanded" data-folder-name="src">▶</span><span class="file-tree__icon">📂</span><span>src</span></div>`;
    treeHtml += `<div class="file-tree__children" data-folder-children="src">`;
    Object.keys(folderMap).forEach(folder => {
      if (folder === 'root') return;
      treeHtml += `<div class="file-tree__item file-tree__item--folder" style="padding-left:24px;"><span class="file-tree__toggle" data-folder-name="${folder}">▶</span><span class="file-tree__icon">📁</span><span>${folder}/</span></div>`;
      treeHtml += `<div class="file-tree__children file-tree__children--collapsed" data-folder-children="${folder}">`;
      folderMap[folder].forEach(id => {
        const node = nodeMap[id];
        if (node) {
          treeHtml += `<div class="file-tree__item file-tree__item--file" style="padding-left:40px;" data-node-id="${node.id}"><span class="file-tree__toggle" style="visibility:hidden;">▶</span><span class="file-tree__icon">📄</span><span>${node.label}.ts</span></div>`;
        }
      });
      treeHtml += `</div>`;
    });
    if (folderMap['root']) {
      folderMap['root'].forEach(id => {
        const node = nodeMap[id];
        if (node) {
          treeHtml += `<div class="file-tree__item file-tree__item--file" style="padding-left:24px;" data-node-id="${node.id}"><span class="file-tree__toggle" style="visibility:hidden;">▶</span><span class="file-tree__icon">📄</span><span>${node.label}.ts</span></div>`;
        }
      });
    }
    treeHtml += `</div>`;
    container.innerHTML = treeHtml;

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
        if (nodeId && cy) {
          const el = cy.getElementById(nodeId);
          if (el && el.length) {
            cy.elements().unselect();
            el.select();
            showNodeDetails(el);
            cy.animate({ center: { eles: el }, zoom: 2.5, duration: 400 });
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
      if (info) {
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-xs) var(--space-sm);background:var(--theme-surface);border-radius:var(--radius-sm);border:1px solid var(--theme-border);"><span class="mono" style="font-size:12px;">${info.label}</span><span style="font-size:10px; color:var(--theme-text-dim);">${info.type}</span></div>`;
      }
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
      const provider = localStorage.getItem('code-intel-llm-provider') || 'openai';
      const result = await service.generateRequirements(selectedNodeIds, document.getElementById('reqPrompt').value, provider, model);
      output.textContent = result.markdown;
      let rows = '';
      (result.traceability || []).forEach(row => {
        rows += `<tr><td><strong>${row.id}</strong></td><td>${row.desc}</td><td><span class="node-ref" data-node-id="${row.node}">${row.node}</span></td></tr>`;
      });
      if (!rows) rows = `<tr><td colspan="3" style="text-align:center; color:var(--theme-text-dim);">No traceability available.</td></tr>`;
      matrixBody.innerHTML = rows;
      
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
      
      status.textContent = '✅ Requirements generated successfully!';
      window._generatedReqDoc = result.markdown;
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
      modal.classList.add('open');
    });

    closeBtn.addEventListener('click', () => modal.classList.remove('open'));
    cancelBtn.addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });

    saveBtn.addEventListener('click', () => {
      const serverUrl = document.getElementById('settingsServerUrl').value.trim();
      const mcpUrl = document.getElementById('settingsMcpUrl').value.trim();
      const provider = document.getElementById('settingsProvider').value;
      const model = document.getElementById('settingsLLM').value;
      const customModel = document.getElementById('settingsCustomModel').value.trim();
      let key = document.getElementById('settingsApiKey').value.trim();

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

  // === Load Graph ===
  async function loadGraph() {
    const statusEl = document.getElementById('serverStatus');
    const dotEl = document.getElementById('serverDot');

    try {
      const status = await service.connect();
      if (service.connected) {
        statusEl.textContent = 'Connected';
        dotEl.style.background = 'var(--theme-success)';
      } else {
        statusEl.textContent = service.connectError && /Failed to fetch|NetworkError|CORS/i.test(service.connectError)
          ? 'Browser CORS / network fallback'
          : 'Mock mode';
        dotEl.style.background = 'var(--theme-warning)';
      }
    } catch (e) {
      statusEl.textContent = 'Disconnected';
      dotEl.style.background = 'var(--theme-danger)';
      console.warn('Connection error:', e);
    }

    const graph = await service.getGraph();
    nodeMap = {};
    graph.nodes.forEach(n => { nodeMap[n.id] = n; });

    document.getElementById('nodeCount').textContent = graph.nodes.length + ' nodes';
    document.getElementById('edgeCount').textContent = graph.edges.length + ' edges';

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

    buildFileTree();
    showEmptyDetails();
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
    loadGraph();
    refreshMCPTools(); // Also refresh MCP tools on load
    enableSplitter();
    enableRightSplitter();

    // Periodic health check (every 30 seconds)
    setInterval(() => {
      refreshMCPTools();
    }, 30000);
  });
})();
