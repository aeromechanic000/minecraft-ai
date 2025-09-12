import { Vec3 } from 'vec3';
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import * as skills from '../../agent/library/skills.js';
import * as world from '../../agent/library/world.js';
import * as mc from '../../utils/mcdata.js';
import settings from '../../../settings.js';

export class PluginInstance {
    constructor(agent) {
        this.agent = agent;
        this.dataDir = 'data/LocalData/';
        this.dataFile = join(this.dataDir, 'data.json');
        this.data = {};
        this.initialized = false;
    }

    initializeDataFile() {
        try {
            // Create data directory if it doesn't exist
            if (!existsSync(this.dataDir)) {
                mkdirSync(this.dataDir, { recursive: true });
                console.log('Created data directory');
            }

            // Initialize data file if it doesn't exist
            if (!existsSync(this.dataFile)) {
                this.data = {
                    'heartbeat': {
                        value: { agent: this.agent.name, timestamp: new Date().toISOString() },
                        timestamp: new Date().toISOString(),
                        agent: this.agent.name
                    }
                };
                
                writeFileSync(this.dataFile, JSON.stringify(this.data, null, 2));
                console.log('Created shared data file');
            } else {
                // Load existing data from file
                const fileContent = readFileSync(this.dataFile, 'utf8');
                this.data = JSON.parse(fileContent);
                console.log('Loaded existing shared data file');
            }

            this.initialized = true;
            console.log('Local data storage initialized successfully');
        } catch (error) {
            console.error('Error initializing local data storage:', error);
            this.data = {}; // Reset to empty object on error
        }
    }

    init() {
        this.initializeDataFile();
    }

    getPluginActions() {
        return [
            {
                name: '!saveData',
                description: 'Save information to local file storage with a key.',
                params: {
                    'key': { type: 'string', description: 'The key to store the information under.' },
                    'info': { type: 'string', description: 'The information to save.' },
                },
                perform: async (agent, key, info) => {
                    if (!this.initialized) {
                        agent.bot.chat('Local storage is still initializing, please wait...');
                        return;
                    }
                    
                    const success = await agent.plugin.plugins["LocalData"].saveToLocalStorage(key, info);
                    if (success) {
                        agent.bot.chat(`Saved data: ${key}`);
                    } else {
                        agent.bot.chat(`Failed to save data: ${key}`);
                    }
                }
            },
            {
                name: '!getData',
                description: 'Retrieve information from local file storage by key.',
                params: {
                    'key': { type: 'string', description: 'The key to retrieve information for. Leave empty to get all data.' },
                },
                perform: async (agent, key) => {
                    if (!this.initialized) {
                        agent.bot.chat('Local storage is still initializing, please wait...');
                        return;
                    }
                    
                    const data = await agent.plugin.plugins["LocalData"].getFromLocalStorage(key);
                    if (data) {
                        if (key) {
                            agent.bot.chat(`Data for ${key}: ${JSON.stringify(data.value)}`);
                        } else {
                            const keys = Object.keys(data);
                            agent.bot.chat(`All data keys: ${keys.join(', ')}`);
                        }
                    } else {
                        agent.bot.chat(`No data found for: ${key || 'any key'}`);
                    }
                }
            },
            {
                name: '!deleteData',
                description: 'Delete information from local file storage by key.',
                params: {
                    'key': { type: 'string', description: 'The key to delete from storage.' },
                },
                perform: async (agent, key) => {
                    if (!this.initialized) {
                        agent.bot.chat('Local storage is still initializing, please wait...');
                        return;
                    }
                    
                    const success = await agent.plugin.plugins["LocalData"].deleteFromLocalStorage(key);
                    if (success) {
                        agent.bot.chat(`Deleted data: ${key}`);
                    } else {
                        agent.bot.chat(`Failed to delete data: ${key}`);
                    }
                }
            }
        ];
    }

    async waitForInitialization() {
        let attempts = 0;
        const maxAttempts = 5;
        
        while (!this.initialized && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }
        
        if (!this.initialized) {
            throw new Error('Local storage initialization timeout');
        }
    }

    async readDataFile() {
        try {
            if (!existsSync(this.dataFile)) {
                return {};
            }
            
            const fileContent = readFileSync(this.dataFile, 'utf8');
            return JSON.parse(fileContent);
        } catch (error) {
            console.error('Error reading data file:', error);
            return {};
        }
    }

    async writeDataFile(data) {
        try {
            writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            console.error('Error writing data file:', error);
            return false;
        }
    }

    async saveToLocalStorage(key, data) {
        try {
            await this.waitForInitialization();
            
            this.data[key] = {
                value: data,
                timestamp: new Date().toISOString(),
                agent: this.agent.name
            };
            
            return await this.writeDataFile(this.data);
        } catch (error) {
            console.error('Error saving to local storage:', error);
            return false;
        }
    }

    async getFromLocalStorage(key = null) {
        try {
            await this.waitForInitialization();
            
            // Refresh data from file in case another process modified it
            this.data = await this.readDataFile();
            
            if (key) {
                return this.data[key] || null;
            } else {
                return this.data;
            }
        } catch (error) {
            console.error('Error getting from local storage:', error);
            return null;
        }
    }

    async deleteFromLocalStorage(key) {
        try {
            await this.waitForInitialization();
            
            if (this.data[key]) {
                delete this.data[key];
                return await this.writeDataFile(this.data);
            } else {
                console.log(`Key ${key} not found in storage`);
                return false;
            }
        } catch (error) {
            console.error('Error deleting from local storage:', error);
            return false;
        }
    }
}