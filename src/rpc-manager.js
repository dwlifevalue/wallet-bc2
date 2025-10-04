import { BLOCKCHAIN_CONFIG } from './blockchain-config.js';

export class RPCManager {
  constructor() {
    this.nodes = [...BLOCKCHAIN_CONFIG.RPC_NODES].sort((a, b) => a.priority - b.priority);
    this.currentNodeIndex = 0;
    this.requestId = 1;
    this.cache = new Map();
    this.requestQueue = new Map();
    this.nodeStatus = new Map();
    this.failureCount = new Map();
    this.busyWaitTime = 2000; // Temps d'attente quand un nœud est occupé
    
    this.nodes.forEach((node, index) => {
      this.nodeStatus.set(index, {
        available: true,
        lastError: null,
        lastSuccess: Date.now(),
        consecutiveFailures: 0
      });
      this.failureCount.set(index, 0);
    });
    
    this.maxRetries = 2;
    this.nodeFailureThreshold = 1;
    this.nodeRecoveryTime = 30000;
    
    console.log(`[RPC-MANAGER] Initialized with ${this.nodes.length} nodes`);
  }

  getCurrentNode() {
    return this.nodes[this.currentNodeIndex];
  }

  // Détecte si un nœud est occupé
  isNodeBusyError(errorMsg) {
    const busyPatterns = [
      'Scan already in progress',
      'already in progress',
      'busy',
      'locked',
      'in use',
      'Resource temporarily unavailable',
      'Another operation is in progress',
      'Operation already running',
      'Database locked',
      'verifying blocks',
      'rescanning',
      'reindexing'
    ];
    
    return busyPatterns.some(pattern => 
      errorMsg.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  markNodeBusy(nodeIndex, error) {
    const status = this.nodeStatus.get(nodeIndex);
    if (!status) return;
    
    status.consecutiveFailures++;
    status.lastError = error.message || String(error);
    status.available = false;
    
    console.warn(`[RPC-MANAGER] Node ${nodeIndex} marked as busy`);
    
    // Recovery rapide pour les nœuds occupés (5 secondes)
    setTimeout(() => {
      this.recoverNode(nodeIndex);
    }, 5000);
  }

  markNodeFailure(nodeIndex, error) {
    const status = this.nodeStatus.get(nodeIndex);
    if (!status) return;
    
    status.consecutiveFailures++;
    status.lastError = error.message || String(error);
    
    if (status.consecutiveFailures >= this.nodeFailureThreshold) {
      status.available = false;
      console.warn(`[RPC-MANAGER] Node ${nodeIndex} marked unavailable`);
      
      setTimeout(() => {
        this.recoverNode(nodeIndex);
      }, this.nodeRecoveryTime);
    }
  }

  markNodeSuccess(nodeIndex) {
    const status = this.nodeStatus.get(nodeIndex);
    if (!status) return;
    
    status.consecutiveFailures = 0;
    status.available = true;
    status.lastSuccess = Date.now();
  }

  recoverNode(nodeIndex) {
    const status = this.nodeStatus.get(nodeIndex);
    if (!status) return;
    
    console.log(`[RPC-MANAGER] Recovering node ${nodeIndex}`);
    status.available = true;
    status.consecutiveFailures = 0;
  }

  resetAllNodes() {
    console.log(`[RPC-MANAGER] Resetting all nodes to available state`);
    this.nodeStatus.forEach((status, idx) => {
      status.available = true;
      status.consecutiveFailures = 0;
    });
    this.currentNodeIndex = 0;
  }

  switchToNextNode() {
    const startIndex = this.currentNodeIndex;
    
    do {
      this.currentNodeIndex = (this.currentNodeIndex + 1) % this.nodes.length;
      const status = this.nodeStatus.get(this.currentNodeIndex);
      
      if (status && status.available) {
        const newNode = this.getCurrentNode();
        console.log(`[RPC-MANAGER] Switched to node ${this.currentNodeIndex}: ${newNode.url}`);
        return true;
      }
      
    } while (this.currentNodeIndex !== startIndex);
    
    console.error('[RPC-MANAGER] All nodes unavailable');
    return false;
  }

  getAvailableNodesCount() {
    let count = 0;
    this.nodeStatus.forEach(status => {
      if (status.available) count++;
    });
    return count;
  }

  async call(method, params = []) {
    const cacheKey = `${method}:${JSON.stringify(params)}`;
    
    if (this.shouldCache(method) && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.getCacheDuration(method)) {
        return cached.data;
      }
      this.cache.delete(cacheKey);
    }

    if (this.requestQueue.has(cacheKey)) {
      return this.requestQueue.get(cacheKey);
    }

    const promise = this.executeRequestWithFailover(method, params);
    this.requestQueue.set(cacheKey, promise);

    try {
      const result = await promise;
      
      if (this.shouldCache(method)) {
        this.cache.set(cacheKey, {
          data: result,
          timestamp: Date.now()
        });
        
        if (this.cache.size > 100) {
          const oldEntries = Array.from(this.cache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp)
            .slice(0, 20);
          oldEntries.forEach(([key]) => this.cache.delete(key));
        }
      }
      
      return result;
    } finally {
      this.requestQueue.delete(cacheKey);
    }
  }

  async executeRequestWithFailover(method, params) {
    let lastError = null;
    const maxAttempts = this.nodes.length * 6;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const nodeIndex = this.currentNodeIndex;
      const node = this.nodes[nodeIndex];
      const status = this.nodeStatus.get(nodeIndex);
      
      if (!status.available) {
        if (this.switchToNextNode()) {
          continue;
        } else {
          console.log(`[RPC-MANAGER] All nodes unavailable, waiting ${this.busyWaitTime}ms...`);
          await this.sleep(this.busyWaitTime);
          this.resetAllNodes();
          continue;
        }
      }
      
      try {
        console.log(`[RPC-MANAGER] Attempt ${attempt + 1}/${maxAttempts} on node ${nodeIndex}: ${method}`);
        const result = await this.executeRequest(node, method, params);
        
        this.markNodeSuccess(nodeIndex);
        return result;
        
      } catch (error) {
        lastError = error;
        const errorMsg = String(error.message || error);
        
        console.warn(`[RPC-MANAGER] Node ${nodeIndex} error: ${errorMsg.substring(0, 150)}`);
        
        // CAS 1: Nœud occupé
        if (this.isNodeBusyError(errorMsg)) {
          console.log(`[RPC-MANAGER] Node ${nodeIndex} is busy, trying to resolve...`);
          
          // Tenter d'annuler si c'est un scan
          if (errorMsg.includes('Scan')) {
            try {
              await this.executeRequest(node, 'scantxoutset', ['abort']);
              await this.sleep(500);
              console.log(`[RPC-MANAGER] Abort command sent to node ${nodeIndex}`);
            } catch (abortError) {
              // Ignorer
            }
          }
          
          this.markNodeBusy(nodeIndex, error);
          
          console.log(`[RPC-MANAGER] Waiting ${this.busyWaitTime}ms before trying another node...`);
          await this.sleep(this.busyWaitTime);
          
          if (this.switchToNextNode()) {
            console.log(`[RPC-MANAGER] Switched to node ${this.currentNodeIndex}, retrying...`);
            continue;
          } else {
            console.log(`[RPC-MANAGER] All nodes busy, waiting ${this.busyWaitTime}ms and resetting...`);
            await this.sleep(this.busyWaitTime);
            this.resetAllNodes();
            continue;
          }
        }
        
        // CAS 2: Erreurs réseau/serveur
        if (errorMsg.includes('500') || 
            errorMsg.includes('503') ||
            errorMsg.includes('504') ||
            errorMsg.includes('timeout') || 
            errorMsg.includes('aborted') ||
            errorMsg.includes('Gateway Time-out') ||
            errorMsg.includes('Network') ||
            errorMsg.includes('Failed to fetch')) {
          
          this.markNodeFailure(nodeIndex, error);
          
          if (this.switchToNextNode()) {
            continue;
          } else {
            throw new Error('All RPC nodes unavailable');
          }
        }
        
        // CAS 3: Autre erreur
        throw error;
      }
    }
    
    throw lastError || new Error(`RPC call failed after ${maxAttempts} attempts`);
  }

  async executeRequest(node, method, params) {
    const requestBody = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.requestId++
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), node.timeout || 2000);

    try {
      const response = await fetch(node.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const text = await response.text();

      if (response.status === 503 || response.status === 504) {
        throw new Error(`HTTP ${response.status}: Gateway timeout`);
      }

      if (response.status === 500) {
        if (text.includes('Scan already in progress')) {
          throw new Error('Scan already in progress');
        }
        throw new Error(`HTTP 500: ${text}`);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
      }

      if (data.error) {
        if (data.error.code === -8 && method === 'gettxout') {
          return null;
        }
        throw new Error(`RPC Error: ${data.error.message} (Code: ${data.error.code})`);
      }

      if (data.id !== requestBody.id) {
        console.warn(`Response ID mismatch: expected ${requestBody.id}, got ${data.id}`);
      }

      return data.result;

    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  shouldCache(method) {
    const cacheableMethods = new Set([
      'getblockchaininfo',
      'getnetworkinfo',
      'getmempoolinfo',
      'getrawtransaction'
    ]);
    return cacheableMethods.has(method);
  }

  getCacheDuration(method) {
    const durations = {
      'getblockchaininfo': 30000,
      'getnetworkinfo': 60000,
      'getmempoolinfo': 15000,
      'getrawtransaction': 300000
    };
    return durations[method] || 5000;
  }

  clearCache() {
    this.cache.clear();
    this.requestQueue.clear();
  }

  getStats() {
    return {
      totalNodes: this.nodes.length,
      availableNodes: this.getAvailableNodesCount(),
      currentNode: this.currentNodeIndex,
      currentNodeUrl: this.getCurrentNode().url,
      cacheSize: this.cache.size,
      nodeStatus: Array.from(this.nodeStatus.entries()).map(([index, status]) => ({
        index,
        url: this.nodes[index].url,
        ...status
      }))
    };
  }

  async testAllNodes() {
    console.log('[RPC-MANAGER] Testing all nodes...');
    const results = [];
    
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const startTime = Date.now();
      
      try {
        await this.executeRequest(node, 'getblockchaininfo', []);
        const responseTime = Date.now() - startTime;
        results.push({
          index: i,
          url: node.url,
          status: 'OK',
          responseTime
        });
        console.log(`[RPC-MANAGER] Node ${i}: OK (${responseTime}ms)`);
      } catch (error) {
        results.push({
          index: i,
          url: node.url,
          status: 'ERROR',
          error: error.message
        });
        console.error(`[RPC-MANAGER] Node ${i}: ERROR - ${error.message}`);
      }
    }
    
    return results;
  }
}

// EXPORTS ESSENTIELS - NE PAS SUPPRIMER
export const rpcManager = new RPCManager();

export async function rpc(method, params = []) {
  return rpcManager.call(method, params);
}

if (typeof window !== 'undefined') {
  window.RPCManager = RPCManager;
  window.rpcManager = rpcManager;
  window.rpc = rpc;
  window.testRPCNodes = () => rpcManager.testAllNodes();
  window.getRPCStats = () => rpcManager.getStats();
}

console.log('[RPC-MANAGER] RPC Manager initialized with multi-node failover');