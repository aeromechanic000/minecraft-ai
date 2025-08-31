import { Vec3 } from 'vec3';
import { readdirSync, readFileSync } from 'fs';
import * as skills from '../../agent/library/skills.js';
import * as world from '../../agent/library/world.js';
import * as mc from '../../utils/mcdata.js';
import settings from '../../../settings.js';

export class PluginInstance {
    constructor(agent) {
        this.agent = agent;
        this.cloud_database_api = `http://${settings.monitor_server_host}:${settings.monitor_server_port}/api`
        this.initialized = false;
    }

    initializeDataTable() {
        fetch(`${this.cloud_database_api}/cloud/tables/CloudKnowledge`)
            .then(response => {
                if (response.status === 404) {
                    console.log('CloudKnowledge table not found, creating...');
                    return this.createCloudKnowledgeTable();
                } else if (response.ok) {
                    console.log('CloudKnowledge table already exists');
                    this.initialized = true;
                    return Promise.resolve();
                } else {
                    console.error('Failed to check CloudKnowledge table existence');
                    return Promise.reject(new Error('Failed to check table'));
                }
            })
            .catch(error => {
                console.error('Error initializing cloud storage plugin:', error);
            });
    }

    createCloudKnowledgeTable() {
        return fetch(`${this.cloud_database_api}/cloud/tables`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: 'CloudKnowledge',
                type: 'dict',
                description: 'Store agent knowledge and memories',
                initialData: {
                    'heartbeat': JSON.stringify({"agent" : this.agent.name, 'timestamp': new Date().toISOString()}),
                }
            })
        })
        .then(response => {
            if (response.ok) {
                console.log('CloudKnowledge table created successfully');
                this.initialized = true;
            } else {
                return response.json().then(error => {
                    console.error('Failed to create CloudKnowledge table:', error.message);
                    throw new Error(error.message);
                });
            }
        })
        .catch(error => {
            console.error('Error creating CloudKnowledge table:', error);
        });
    }

    init() {
       this.initializeDataTable(); 
    }

    getPluginActions() {
        return [
            {
                name: '!saveKnowledge',
                description: 'Save information to cloud storage with a key.',
                params: {
                    'key': {type: 'string', description: 'The key to store the information under.'},
                    'info': {type: 'string', description: 'The information to save.'},
                },
                perform: async (agent, key, info) => {
                    if (!this.initialized) {
                        agent.bot.chat('Cloud storage is still initializing, please wait...');
                        return;
                    }
                    
                    const success = await agent.plugin.plugins["CloudKnowledge"].saveToCloudStorage(key, info);
                    if (success) {
                        agent.bot.chat(`Saved knowledge: ${key}`);
                    } else {
                        agent.bot.chat(`Failed to save knowledge: ${key}`);
                    }
                }
            },
            {
                name: '!getKnowledge',
                description: 'Retrieve information from cloud storage by key.',
                params: {
                    'key': {type: 'string', description: 'The key to retrieve information for. Leave empty to get all data.'},
                },
                perform: async (agent, key) => {
                    if (!this.initialized) {
                        agent.bot.chat('Cloud storage is still initializing, please wait...');
                        return;
                    }
                    
                    const data = await agent.plugin.plugins["CloudKnowledge"].getFromCloudStorage(key);
                    if (data) {
                        if (key) {
                            agent.bot.chat(`Knowledge for ${key}: ${JSON.stringify(data.value)}`);
                        } else {
                            const keys = Object.keys(data);
                            agent.bot.chat(`All knowledge keys: ${keys.join(', ')}`);
                        }
                    } else {
                        agent.bot.chat(`No knowledge found for: ${key || 'any key'}`);
                    }
                }
            },
        ]
    }

    async waitForInitialization() {
        // Helper method to wait for initialization if needed
        let attempts = 0;
        const maxAttempts = 5; // 5 seconds max wait
        
        while (!this.initialized && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }
        
        if (!this.initialized) {
            throw new Error('Cloud storage initialization timeout');
        }
    }

    async saveToCloudStorage(key, data) {
        try {
            await this.waitForInitialization();
            
            const response = await fetch(`${this.cloud_database_api}/cloud/tables/CloudKnowledge/data`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    key: key,
                    data: {
                        value: data,
                        timestamp: new Date().toISOString(),
                        agent: this.agent.name
                    }
                })
            });

            if (response.ok) {
                return true;
            } else {
                const error = await response.json();
                console.error('Failed to save to cloud storage:', error.message);
                return false;
            }
        } catch (error) {
            console.error('Error saving to cloud storage:', error);
            return false;
        }
    }

    async getFromCloudStorage(key = null) {
        try {
            await this.waitForInitialization();
            
            const response = await fetch(`${this.cloud_database_api}/cloud/tables/CloudKnowledge/data`);
            
            if (response.ok) {
                const result = await response.json();
                const data = result.data.data;
                
                if (key) {
                    // Return specific key
                    return data[key] || null;
                } else {
                    // Return all data
                    return data;
                }
            } else {
                const error = await response.json();
                console.error('Failed to get from cloud storage:', error.message);
                return null;
            }
        } catch (error) {
            console.error('Error getting from cloud storage:', error);
            return null;
        }
    }
}