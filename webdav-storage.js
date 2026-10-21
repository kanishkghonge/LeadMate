/**
 * WebDAV Storage Module for LeadMate
 * Provides cloud synchronization via WebDAV protocol
 */

class WebDAVStorage {
  constructor() {
    this.config = this.loadConfig();
    this.syncInProgress = false;
    this.lastSync = null;
  }

  loadConfig() {
    try {
      const saved = localStorage.getItem('leadmate-webdav-config');
      return saved ? JSON.parse(saved) : {
        enabled: false,
        url: '',
        username: '',
        password: '',
        autoSync: false,
        syncInterval: 300000 // 5 minutes
      };
    } catch {
      return {
        enabled: false,
        url: '',
        username: '',
        password: '',
        autoSync: false,
        syncInterval: 300000
      };
    }
  }

  saveConfig(config) {
    this.config = { ...this.config, ...config };
    localStorage.setItem('leadmate-webdav-config', JSON.stringify(this.config));
  }

  async testConnection() {
    if (!this.config.url || !this.config.username || !this.config.password) {
      throw new Error('WebDAV configuration incomplete');
    }

    try {
      const response = await fetch(this.config.url, {
        method: 'PROPFIND',
        headers: {
          'Authorization': 'Basic ' + btoa(this.config.username + ':' + this.config.password),
          'Depth': '0'
        }
      });

      if (response.ok || response.status === 207) {
        return { success: true, message: 'Connection successful' };
      } else if (response.status === 401) {
        throw new Error('Authentication failed. Check username and password.');
      } else {
        throw new Error(`Connection failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      throw new Error(`Connection test failed: ${error.message}`);
    }
  }

  async uploadData(data, filename = 'leadmate-backup.json') {
    if (!this.config.enabled) {
      throw new Error('WebDAV is not enabled');
    }

    if (this.syncInProgress) {
      throw new Error('Sync already in progress');
    }

    this.syncInProgress = true;

    try {
      const url = this.config.url.endsWith('/') 
        ? this.config.url + filename 
        : this.config.url + '/' + filename;

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': 'Basic ' + btoa(this.config.username + ':' + this.config.password),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data, null, 2)
      });

      if (response.ok || response.status === 201 || response.status === 204) {
        this.lastSync = new Date().toISOString();
        return { success: true, message: 'Data uploaded successfully', timestamp: this.lastSync };
      } else if (response.status === 401) {
        throw new Error('Authentication failed');
      } else if (response.status === 403) {
        throw new Error('Permission denied. Check write permissions.');
      } else if (response.status === 404) {
        throw new Error('Path not found. Check WebDAV URL.');
      } else {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      throw new Error(`Upload error: ${error.message}`);
    } finally {
      this.syncInProgress = false;
    }
  }

  async downloadData(filename = 'leadmate-backup.json') {
    if (!this.config.enabled) {
      throw new Error('WebDAV is not enabled');
    }

    try {
      const url = this.config.url.endsWith('/') 
        ? this.config.url + filename 
        : this.config.url + '/' + filename;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + btoa(this.config.username + ':' + this.config.password)
        }
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, data, message: 'Data downloaded successfully' };
      } else if (response.status === 404) {
        return { success: false, message: 'No backup found on server' };
      } else if (response.status === 401) {
        throw new Error('Authentication failed');
      } else {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      throw new Error(`Download error: ${error.message}`);
    }
  }

  async listBackups() {
    if (!this.config.enabled) {
      throw new Error('WebDAV is not enabled');
    }

    try {
      const response = await fetch(this.config.url, {
        method: 'PROPFIND',
        headers: {
          'Authorization': 'Basic ' + btoa(this.config.username + ':' + this.config.password),
          'Depth': '1',
          'Content-Type': 'application/xml'
        },
        body: `<?xml version="1.0"?>
          <d:propfind xmlns:d="DAV:">
            <d:prop>
              <d:displayname/>
              <d:getlastmodified/>
              <d:getcontentlength/>
            </d:prop>
          </d:propfind>`
      });

      if (response.ok || response.status === 207) {
        const text = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');
        const responses = xmlDoc.getElementsByTagNameNS('DAV:', 'response');
        
        const files = [];
        for (let i = 0; i < responses.length; i++) {
          const href = responses[i].getElementsByTagNameNS('DAV:', 'href')[0]?.textContent;
          const displayname = responses[i].getElementsByTagNameNS('DAV:', 'displayname')[0]?.textContent;
          const lastmodified = responses[i].getElementsByTagNameNS('DAV:', 'getlastmodified')[0]?.textContent;
          const size = responses[i].getElementsByTagNameNS('DAV:', 'getcontentlength')[0]?.textContent;
          
          if (displayname && displayname.includes('leadmate') && displayname.endsWith('.json')) {
            files.push({
              name: displayname,
              path: href,
              modified: lastmodified ? new Date(lastmodified) : null,
              size: size ? parseInt(size) : 0
            });
          }
        }
        
        return { success: true, files };
      } else {
        throw new Error(`List failed: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`List error: ${error.message}`);
    }
  }

  async autoSync(getData) {
    if (!this.config.enabled || !this.config.autoSync) {
      return;
    }

    try {
      const data = getData();
      const filename = `leadmate-autosync-${new Date().toISOString().slice(0, 10)}.json`;
      await this.uploadData(data, filename);
      console.log('Auto-sync completed:', filename);
    } catch (error) {
      console.error('Auto-sync failed:', error);
    }
  }

  startAutoSync(getData) {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
    }

    if (this.config.enabled && this.config.autoSync) {
      this.autoSyncInterval = setInterval(() => {
        this.autoSync(getData);
      }, this.config.syncInterval);
      
      // Initial sync
      this.autoSync(getData);
    }
  }

  stopAutoSync() {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }
}

// Initialize global WebDAV instance
window.webdavStorage = new WebDAVStorage();
