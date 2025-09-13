import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { Server } from 'socket.io';
import { getKey, hasKey } from '../utils/keys.js';
import settings from '../../settings.js';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import cors_proxy from 'cors-anywhere';
import { splitContentAndJSON } from '../utils/generation.js';
import { Prompter } from './monitor_prompter.js';
import { commands } from './monitor_commands.js';
import cors from 'cors';
import FormData from 'form-data';

// Module-level variables
let io;
let server;
const registeredAgents = new Set();
const agentManagers = {}; // socket for main process that registers/controls agents
const agentSockets = {}; 
const agentMessages = {}; // Store messages sent to agents
const agentStatusLogs = []; // Store status change logs
const pendingStatusRequests = {}; // Add this line for status requests
const actionLogs = []; // Store action logs
const monitorMessages = [];

const prompter = new Prompter();

// New data structures for API functionality
const agentDatabase = {}; // Store detailed agent information
const cloudDatabase = {};

mkdirSync(`./data`, { recursive: true });
const database_fp = `./data/cloud_database.json`;

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function saveCloudDatabase() {
    try {
        writeFileSync(database_fp, JSON.stringify(cloudDatabase, null, 2));
        console.log('Saved cloud database to:', database_fp);
    } catch (error) {
        console.error('Failed to save cloud database:', error);
        throw error;
    }
}

function loadCloudDatabase() {
    try {
        if (!existsSync(database_fp)) {
            console.log('No cloud database file found.');
            return null;
        }
        const database = JSON.parse(readFileSync(database_fp, 'utf8'));
        for (let name in database) {
            cloudDatabase[name] = database[name];
        }
        console.log('Loaded cloud database.');
    } catch (error) {
        console.error('Failed to load cloud database:', error);
        throw error;
    }
}

export function createProxyServer(port = 8081, options = []) {
    const defaultOptions = {
        originWhitelist: [],
        requireHeader: [],
        removeHeaders: ['cookie', 'cookie2'],
        redirectSameOrigin: true,
        httpProxyOptions: {
            xfwd: false,
        }
    };
    
    const server = cors_proxy.createServer({...defaultOptions, ...options});
    
    server.listen(port, 'localhost', () => {
        console.log(`CORS proxy server started on port ${port}`);
    });
    
    return server; 
}

// Initialize the server

export function createMonitorServer(port = 8080) {
    const app = express();
    server = http.createServer(app);
    io = new Server(server);

    if (settings.load_cloud_database) {
        loadCloudDatabase();
    }

    if (cloudTableExists("GlobalInfo")) {
        // update serverStartTime
        cloudDatabase["GlobalInfo"].serverStartTime = new Date().toISOString();
    } else {
        addCloudTable("GlobalInfo", "dict", "Store the global informations.", {"serverStartTime": new Date().toISOString()});
    }

    // Middleware
    app.use(cors({
        origin: [`http://localhost:${port}`],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    }));

    app.use(express.json({ limit: '50mb' })); // Increase from default 100kb
    app.use(express.urlencoded({ extended: true, limit: '20mb' }));

    // Serve static files
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    app.use(express.static(path.join(__dirname, 'public')));

    // ==================== REST API ENDPOINTS ====================
        
    app.get('/api/system_status', async (req, res) => {
        try {
            const now = new Date();
            res.json({
                success: true,
                data: {
                    totalAgents: registeredAgents.size,
                    activeAgents: Object.keys(agentManagers).length,
                    serverStatus: 'Connected',
                    uptime: now.toLocaleTimeString('en-GB', { hour12: false }),
                    memoryUsage: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
                }
            });
        } catch (error) {
            console.error('Error reporting system status:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to report system status."
            });
        }
    });

    app.post('/api/monitor_query', async (req, res) => {
        try {
            const { query } = req.body;
            const result = await processMonitorQuery(query);
            res.json({
                success: true,
                data: {
                    status: 'success',
                    message: result.text,
                }
            });
        } catch (error) {
            console.error('Error processing monitor query:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to process monitor query."
            });
        }
    });

    app.get('/api/agents', (req, res) => {
        try {
            const now = new Date();
            const agents = []
            for (let name in agentDatabase) {
                const agent = agentDatabase[name];
                agents.push({
                    id: agent.id,
                    name: agent.name,
                    status: agent.status,
                    lastHeartbeat: agent.lastHeartbeat,
                    currentTask: agent.currentTask,
                    registeredAt: agent.registeredAt,
                    health: agent.health || 20,
                    maxHealth: agent.maxHealth || 20,
                    hunger: agent.hunger || 20,
                    experience: agent.experience || 0,
                    gameMode: agent.gameMode || 'survival',
                    dimension: agent.dimension || 'overworld',
                    biome: agent.biome || 'plains',
                    coordinates: agent.coordinates || { x: 0, y: 64, z: 0 },
                    task: agent.currentTask || null,
                })
            };
            res.json({
                success: true,
                data: agents, 
            });
        } catch (error) {
            console.error('Error reporting agents data:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to get agents data."
            });
        }
    });

    app.get('/api/agents/:agentName/stop', (req, res) => {
        try {
            const agentName = req.params.agentName;

            const socket = agentSockets[agentName];
            if (!socket) {
                return res.status(404).json({
                    success: false,
                    error: "AGENT_SOCKET_NOT_FOUND",
                    message: `No socket found for agent ${agentName}`
                });
            }
            logoutAgent(agentName);

            const manager = agentManagers[agentName];
            if (!manager) {
                return res.status(404).json({
                    success: false,
                    error: "AGENT_MANAGER_NOT_FOUND",
                    message: `No manager found for agent ${agentName}`
                });
            }
            manager.emit('stop-agent', agentName);
            
            const agent = agentDatabase[agentName];
            if (agent) {
                agent.status = 'stopping';
            }
            
            addAgentStatusLog(agentName, 'stop', 'info', 'Stop command sent to agent');
            
            res.json({
                success: true,
                message: `Stop command sent to agent ${agentName}`
            });

        } catch (error) {
            console.error('Error stopping agent:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to stop agent"
            });
        }
    });
    
    app.get('/api/agents/:agentName/start', (req, res) => {
        try {
            const agentName = req.params.agentName;
            const manager = agentManagers[agentName];
            if (!manager) {
                return res.status(404).json({
                    success: false,
                    error: "AGENT_MANAGER_NOT_FOUND",
                    message: `No manager found for agent ${agentName}`
                });
            }

            manager.emit('start-agent', agentName);
            const agent = agentDatabase[agentName];
            if (agent) {
                agent.status = 'online';
            }
            
            addAgentStatusLog(agentName, 'start', 'info', 'Start command sent to agent');
            
            res.json({
                success: true,
                message: `Start command sent to agent ${agentName}`
            });

        } catch (error) {
            console.error('Error starting agent:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to start agent"
            });
        }
    });
    
    app.get('/api/agents/:agentName/status', async (req, res) => {
        try {
            const agentName = req.params.agentName;
            await updateAgentData(agentName);
            const agent = agentDatabase;
            if (!agent) {
                return res.status(404).json({
                    success: false,
                    error: "AGENT_NOT_FOUND",
                    message: "Agent not found"
                });
            }
            res.json({
                success: true,
                data: agent, 
            });

        } catch (error) {
            console.error('Error getting agent status:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to get agent status"
            });
        }
    });
    
    app.get('/api/agents/:agentName/messages', async (req, res) => {
        try {
            const agentName = req.params.agentName;

            res.json({
                success: true,
                data: agentMessages[agentName] || [], 
            });

        } catch (error) {
            console.error('Error getting agent messages:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to get agent messages"
            });
        }
    });
    
    // Send command to agent
    app.post('/api/agents/:agentName/command', (req, res) => {
        try {
            const agentName = req.params.agentName;
            const { command } = req.body;
            
            const agent = agentDatabase[agentName];
            if (!agent) {
                return res.status(404).json({
                    success: false,
                    error: "AGENT_NOT_FOUND",
                    message: "Agent not found"
                });
            }

            // Store the message
            if (! (agentName in agentMessages)) {
                agentMessages[agentName] = [];
            }
            
            const message = {
                id: Date.now(),
                message: command,
                timestamp: new Date().toLocaleTimeString(),
                sender: 'user',
                status: 'delivered'
            };
            
            agentMessages[agentName].unshift(message);
            
            // Keep only last 50 messages
            if (agentMessages[agentName].length > 50) {
                agentMessages[agentName].splice(50);
            }

            sendCommand(agentName, command);

            res.json({
                success: true,
                data: {
                    messageId: message.id,
                    status: 'delivered'
                }
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to send command"
            });
        }
    });

    // Transcribe audio endpoint
    // In monitor_server.js, update the transcribe endpoint
    app.post('/api/transcribe', async (req, res) => {
        try {
            const { audio } = req.body;
            
            if (!audio) {
                return res.status(400).json({
                    success: false,
                    error: "MISSING_AUDIO",
                    message: "Audio data is required"
                });
            }

            // Check audio size (base64 encoded)
            const audioSizeKB = (audio.length * 3/4) / 1024; // Approximate decoded size
            if (audioSizeKB > 20000) { // 20MB limit
                return res.status(413).json({
                    success: false,
                    error: "AUDIO_TOO_LARGE",
                    message: "Audio file too large. Please try shorter recordings."
                });
            }

            const transcript = await transcribeAudio(audio);
            
            res.json({
                success: true,
                transcript: transcript
            });

        } catch (error) {
            console.error('Error transcribing audio:', error);
            res.status(500).json({
                success: false,
                error: "TRANSCRIPTION_ERROR",
                message: error.message || "Failed to transcribe audio"
            });
        }
    });

    // Get list of all cloud tables
    app.get('/api/cloud/tables', (req, res) => {
        try {
            const tables = listCloudTables();
            
            res.json({
                success: true,
                data: {
                    tables: tables,
                    totalTables: tables.length
                }
            });

        } catch (error) {
            console.error('Error getting cloud tables list:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to get cloud tables list"
            });
        }
    });

    app.post('/api/cloud/tables', (req, res) => {
        try {
            const { name, type, description, initialData } = req.body;
            
            // Validate required fields
            if (!name) {
                return res.status(400).json({
                    success: false,
                    error: "MISSING_NAME",
                    message: "Table name is required"
                });
            }
            
            if (!type) {
                return res.status(400).json({
                    success: false,
                    error: "MISSING_TYPE",
                    message: "Table type is required"
                });
            }
            
            // Validate table type
            if (type !== 'list' && type !== 'dict') {
                return res.status(400).json({
                    success: false,
                    error: "INVALID_TYPE",
                    message: "Table type must be 'list' or 'dict'"
                });
            }
            
            // Check if table already exists
            if (cloudTableExists(name)) {
                return res.status(409).json({
                    success: false,
                    error: "TABLE_EXISTS",
                    message: `Table '${name}' already exists`
                });
            }
            
            // Validate initialData type if provided
            if (initialData !== undefined) {
                const isValidData = (type === 'list' && Array.isArray(initialData)) ||
                                (type === 'dict' && typeof initialData === 'object' && !Array.isArray(initialData));
                
                if (!isValidData) {
                    return res.status(400).json({
                        success: false,
                        error: "INVALID_INITIAL_DATA",
                        message: `Initial data type mismatch. Expected ${type === 'list' ? 'array' : 'object'}`
                    });
                }
            }
            
            // Create the table
            const success = addCloudTable(name, type, description || '', initialData);
            
            if (!success) {
                return res.status(500).json({
                    success: false,
                    error: "CREATION_FAILED",
                    message: "Failed to create table"
                });
            }
            
            // Get the created table info
            const table = getCloudTable(name);
            const tableInfo = {
                name: name,
                type: type,
                description: description || '',
                createdAt: table.info.createdAt,
                lastModified: table.info.lastModified,
                dataSize: type === 'list' ? table.data.length : Object.keys(table.data).length
            };
            
            // Emit update to all connected clients
            const updatedTable = {
                data: table.data,
                info: table.info,
            };
            io.emit('cloud-database-update', updatedTable);
            
            res.status(201).json({
                success: true,
                message: `Table '${name}' created successfully`,
                data: {
                    table: tableInfo
                }
            });

        } catch (error) {
            console.error('Error creating cloud table:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to create cloud table"
            });
        }
    });

    app.get('/api/cloud/tables/:tableName', (req, res) => {
        try {
            const tableName = req.params.tableName;
            
            if (!cloudTableExists(tableName)) {
                return res.status(404).json({
                    success: false,
                    error: "TABLE_NOT_FOUND",
                    message: `Table '${tableName}' not found`
                });
            }

            const tableInfo = getCloudTableInfo(tableName);
            const table = getCloudTable(tableName);
            
            res.json({
                success: true,
                data: {
                    ...tableInfo,
                    dataSize: table.info.type === 'list' ? table.data.length : Object.keys(table.data).length,
                }
            });

        } catch (error) {
            console.error('Error getting cloud table info:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to get cloud table info"
            });
        }
    });

    app.get('/api/cloud/tables/:tableName/data', (req, res) => {
        try {
            const tableName = req.params.tableName;
            
            if (!cloudTableExists(tableName)) {
                return res.status(404).json({
                    success: false,
                    error: "TABLE_NOT_FOUND",
                    message: `Table '${tableName}' not found`
                });
            }

            const tableData = getCloudTableData(tableName);
            const tableInfo = getCloudTableInfo(tableName);
            
            res.json({
                success: true,
                data: {
                    tableName: tableName,
                    type: tableInfo.type,
                    data: tableData,
                }
            });

        } catch (error) {
            console.error('Error getting cloud table data:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to get cloud table data"
            });
        }
    });

    app.post('/api/cloud/tables/:tableName/data', (req, res) => {
        try {
            const tableName = req.params.tableName;
            const { data, key } = req.body; // key is only used for dict type
            
            if (!cloudTableExists(tableName)) {
                return res.status(404).json({
                    success: false,
                    error: "TABLE_NOT_FOUND",
                    message: `Table '${tableName}' not found`
                });
            }

            const table = getCloudTable(tableName);
            const tableType = table.info.type;

            if (tableType === 'list') {
                // For list type, append data to array
                table.data.push(data);
            } else if (tableType === 'dict') {
                // For dict type, need a key
                if (!key) {
                    return res.status(400).json({
                        success: false,
                        error: "MISSING_KEY",
                        message: "Key is required for dict type tables"
                    });
                }
                table.data[key] = data;
            }

            table.info.lastModified = new Date().toISOString();
            saveCloudDatabase();

            // Emit update to all connected clients
            const updatedTable = {
                data: table.data,
                info: table.info,
            };
            updatedTable.info.dataSize = (tableType === 'list' ? table.data.length : Object.keys(table.data).length);
            io.emit('cloud-database-update', updatedTable);

            res.json({
                success: true,
                message: `Data added to table '${tableName}'`,
                data: {
                    tableName: tableName,
                    operation: 'add',
                    dataSize: tableType === 'list' ? table.data.length : Object.keys(table.data).length
                }
            });

        } catch (error) {
            console.error('Error adding data to cloud table:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to add data to cloud table"
            });
        }
    });

    // Update/modify data in a cloud table
    app.put('/api/cloud/tables/:tableName/data', (req, res) => {
        try {
            const tableName = req.params.tableName;
            const { data, key, index } = req.body; // index for list type, key for dict type
            
            if (!cloudTableExists(tableName)) {
                return res.status(404).json({
                    success: false,
                    error: "TABLE_NOT_FOUND",
                    message: `Table '${tableName}' not found`
                });
            }

            const table = getCloudTable(tableName);
            const tableType = table.info.type;

            if (tableType === 'list') {
                // For list type, need an index
                if (typeof index !== 'number') {
                    return res.status(400).json({
                        success: false,
                        error: "MISSING_INDEX",
                        message: "Index is required for list type tables"
                    });
                }
                
                if (index < 0 || index >= table.data.length) {
                    return res.status(400).json({
                        success: false,
                        error: "INVALID_INDEX",
                        message: `Index ${index} is out of bounds for table with ${table.data.length} items`
                    });
                }
                
                table.data[index] = data;
            } else if (tableType === 'dict') {
                // For dict type, need a key
                if (!key) {
                    return res.status(400).json({
                        success: false,
                        error: "MISSING_KEY",
                        message: "Key is required for dict type tables"
                    });
                }
                
                table.data[key] = data;
            }

            table.info.lastModified = new Date().toISOString();
            saveCloudDatabase();

            // Emit update to all connected clients
            const updatedTable = {
                data: table.data,
                info: table.info,
            };
            updatedTable.info.dataSize = (tableType === 'list' ? table.data.length : Object.keys(table.data).length);
            io.emit('cloud-database-update', updatedTable);

            res.json({
                success: true,
                message: `Data updated in table '${tableName}'`,
                data: {
                    tableName: tableName,
                    operation: 'update',
                    [tableType === 'list' ? 'index' : 'key']: tableType === 'list' ? index : key
                }
            });

        } catch (error) {
            console.error('Error updating data in cloud table:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to update data in cloud table"
            });
        }
    });

    // ==================== SOCKET.IO HANDLERS ====================

    // Socket.io connection handling
    io.on('connection', (socket) => {
        let curAgentName = null;
        console.log('Client connected:', socket.id);

        // Handle agent registration (from agent processes)
        socket.on('register-agents', (agentNames) => {
            console.log(`Registering agents: ${agentNames}`);
            agentNames.forEach((name, index) => {
                registeredAgents.add(name);
                
                // Create agent entry in database if not exists
                if (! (name in agentDatabase)) {
                    const agentData = {
                        id: Date.now() + Math.random(),
                        name: name,
                        status: 'offline',
                        health: 20,
                        maxHealth: 20,
                        hunger: 20,
                        experience: 0,
                        gameMode: 'survival',
                        dimension: 'overworld',
                        biome: 'plains',
                        coordinates: { x: 0, y: 0, z: 0 },
                        task: null,
                        registeredAt: new Date().toISOString(),
                        lastHeartbeat: new Date().toISOString(),
                        currentTask: null,
                        stats: {
                            totalPlayTime: 0,
                            tasksCompleted: 0,
                            blocksPlaced: 0,
                            blocksBroken: 0
                        }
                    };
                    agentDatabase[name] = agentData;
                }
            });
            
            for (let name of agentNames) {
                agentManagers[name] = socket;
            }
            
            socket.emit('register-agents-success');

            updateAgentDatabase();
        });

        socket.on('login-agent', (agentName, count_id) => {
            if (agentSockets[agentName]) {
                console.warn(`Agent ${agentName} already logged in.`);
                return;
            }

            if (registeredAgents.has(agentName)) {
                agentSockets[agentName] = socket;
                // Update agent status in database
                updateAgentDatabase();
                const agent = agentDatabase[agentName];
                if (agent) {
                    agent.id = count_id;
                    agent.status = 'online';
                    agent.lastHeartbeat = new Date().toISOString();
                }
                
                // Add status log
                addAgentStatusLog(agentName, 'login', 'success', 'Agent logged in successfully');
            } else {
                console.warn(`Agent ${agentName} not registered`);
            }
        });

        socket.on('logout-agent', (agentName) => {
           logoutAgent(agentName); 
        });

        socket.on('status-response', (requestId, status) => {
            const request = pendingStatusRequests[requestId];
            if (request) {
                clearTimeout(request.timeout);
                delete pendingStatusRequests[requestId];
                request.resolve(status);
                if (status) {
                    addAgentStatusLog(status.name, 'status', 'info', 'Received update of agent status.');
                } else {
                    addAgentStatusLog(status.name, 'chat', 'error', 'Received null status.');
                }
            }
        });
    });

    server.listen(port, 'localhost', () => {
        console.log(`Monitor Server running on port ${port}`);
    });

    return server;
}

// Helper function to format uptime
function formatUptime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function sendCommand(agentName, command) {
    if (!agentSockets[agentName]) {
        console.warn(`Agent ${agentName} not logged in, cannot send command via Monitor Server.`);
        return
    }
    try {
        console.log(`Sending command to agent ${agentName}: ${command}`);
        agentSockets[agentName].emit('send-message', "Administrator", command);
        addAgentStatusLog(agentName, 'chat', 'success', 'Sent message to agent.');
    } catch (error) {
        console.error('Error: ', error);
    }
} 

function addActionLog(actionName, description, params, status) {
    const logEntry = {
        id: Date.now(),
        name: actionName,
        description: description,
        params: params,
        status: status,
        timestamp: new Date().toLocaleTimeString()
    };
    actionLogs.unshift(logEntry);
    if (actionLogs.length > 100) {
        actionLogs.splice(100);
    }
    // Broadcast to all connected clients
    io.emit('new-action-log', logEntry);
}

function addAgentStatusLog(agentName, event, type, message, data = null) {
    const logEntry = {
        id: Date.now(),
        agent: agentName,
        event: event,
        type: type,
        message: message,
        data: data,
        timestamp: new Date().toLocaleTimeString()
    };
    
    agentStatusLogs.unshift(logEntry);
    
    // Keep only last 100 logs
    if (agentStatusLogs.length > 100) {
        agentStatusLogs.splice(100);
    }
    
    // Broadcast to all connected clients
    io.emit('new-agent-status-log', logEntry);
}

function requestAgentStatus(agentName) {
    return new Promise((resolve, reject) => {
        const requestId = generateId();
        const timeout = setTimeout(() => {
            delete pendingStatusRequests[requestId];
            console.warn(`Request timeout for agent ${agentName}`);
            resolve(null);
        }, 5000);

        pendingStatusRequests[requestId] = { resolve, reject, timeout };
        
        if (agentSockets[agentName]) {
            agentSockets[agentName].emit('request-status', requestId);
        } else {
            clearTimeout(timeout);
            delete pendingStatusRequests[requestId];
            console.warn(`Agent ${agentName} not connected`);
            resolve(null); 
        }
    });
}

async function updateAgentData(agentName) {
    try {
        const status = await requestAgentStatus(agentName);
        const agent = agentDatabase[agentName];
        if (agent) {
            Object.assign(agent, status);
            agentDatabase[agentName] = agent;
        }
    } catch (error) {
        console.error("Error updating agent data:", error);
        throw error;
    }
}

function updateAgentDatabase() {
    const agents = [];
    registeredAgents.forEach(name => {
        updateAgentData(name);
        const agent = agentDatabase[name];
        if (agent) {
            agents.push({name, in_game: agent.status === "online"});
        }
    })
    registeredAgents.forEach(name => {
        if (agentSockets[name]) {
            agentSockets[name].emit('agents-update', agents);
        }
    })
}

function getAgentsUpdateData() {
    updateAgentDatabase();
    let agents = [];
    registeredAgents.forEach(name => {
        const agentData = agentDatabase[name];
        agents.push({
            name, 
            id: agentData?.id,
            status: agentData?.status || 'offline',
            lastHeartbeat: agentData?.lastHeartbeat
        });
    });
    return agents;
}

function addMonitorMessage(message) { 
    monitorMessages.push(message)
    if (monitorMessages.length > settings.max_monitor_messages) {
        monitorMessages.splice(0, monitorMessages.length - settings.max_monitor_messages);
    }
}

async function processMonitorQuery(query) {
    let result = {text : ""};

    addMonitorMessage({"role" : "user", "content" : query}) 

    result.text = await prompter.promptMonitorQuery(monitorMessages, query)

    let [content, data] = splitContentAndJSON(result.text);
    if (data.text_response) {
        result.text = data.text_response;
    }

    let message = {"role" : "assistant", "content" : result.text}

    if (data.actions && Array.isArray(data.actions)) {
        message.content += ` Perform actions: ${JSON.stringify(data.actinos)}`
        data.actions.forEach(action => {
            const command = commands.find(c => c.name === action.name);
            if (command) {
                executeAction(action);
                addActionLog(action.name, 'Action delivered.', JSON.stringify(action.params), 'delivered');
            } else {
                addActionLog(action.name, 'Cannot find the action.', JSON.stringify(action.params), 'warning');
            }
        })
    }
    addMonitorMessage(message);
    console.log("Result of monitor query processing:", result);
    return result;
}

async function executeAction(action) {
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
        const command = commands.find(c => c.name === action.name);
        let args = {};
        for (let key in command.params || {}) {
            if (key in action.params) {
                args[key] = action.params[key];
            } else {
                args[key] = null;
            }
        } 
        if (Object.keys(args) > 0) {
            await command.perform(agentSockets, ...args);
        } else {
            await command.perform(agentSockets);
        }
        addActionLog(action.name, 'Action finished.', JSON.stringify(action.params), 'finished');
    } catch (error) {
        console.log(`Error in executiong ${action.name} with arguments ${action.params}: ${error}`);
        addActionLog(action.name, "Error in executing the action.", JSON.stringify(action.params), 'error');
    }
}

async function transcribeAudio(audioBase64) {
    try {
        let response;

        if (settings.stt_service_provider === 'openai') {
            if (hasKey('OPENAI_API_KEY')) {
                // Convert base64 to blob for FormData
                const audioBuffer = Buffer.from(audioBase64, 'base64');
                const formData = new FormData();
                formData.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'audio.webm');
                formData.append('model', 'whisper-1');
                
                try {
                    response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${getKey("OPENAI_API_KEY")}`
                        },
                        body: formData
                    });

                    if (!response.ok) {
                        throw new Error(`OpenAI API request failed with status ${response.status}`);
                    }

                    const data = await response.json();
                    return data.text;
                } catch (openaiError) {
                    console.log("Error calling STT service of OpenAI:", openaiError);
                    throw new Error("Error calling STT service of OpenAI.");
                }
            } else {
                throw new Error("OpenAI API key is not configured.");
            }
        } else if (settings.stt_service_provider === 'bytedance') {
            if (!hasKey('BYTEDANCE_APP_ID') || !hasKey('BYTEDANCE_APP_TOKEN')) {
                throw new Error("ByteDance API credentials are not configured.");
            }

            const requestId = generateId(); // Use your existing generateId function
            
            // Step 1: Submit the transcription request
            const submitResponse = await fetch(`https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-App-Key': getKey("BYTEDANCE_APP_ID"),
                    'X-Api-Access-Key': getKey("BYTEDANCE_APP_TOKEN"),
                    'X-Api-Resource-Id': 'volc.bigasr.auc',
                    'X-Api-Request-Id': requestId,
                    'X-Api-Sequence': '-1'
                },
                body: JSON.stringify({
                    "user": {
                        "uid": "" 
                    },
                    "audio": {
                        "format": "raw",
                        "data": audioBase64, 
                        "sample_rate": 16000, // Default sample rate
                        "channel_num": 1, 
                        "bits_per_sample": 16
                    },
                    "request": {
                        "model_name": "bigmodel",
                        "enable_itn": true
                    }
                })
            });
            
            const submitStatusCode = submitResponse.headers.get('X-Api-Status-Code');
            const submitMessage = submitResponse.headers.get('X-Api-Message');
            
            if (submitStatusCode === '20000000') {
                // Step 2: Poll for the result
                const taskResult = await pollByteDanceTaskResult(requestId);
                
                if (taskResult && taskResult.result && taskResult.result.text) {
                    return taskResult.result.text;
                } else if (taskResult && taskResult.error) {
                    throw new Error(taskResult.error);
                } else {
                    throw new Error('No transcription result received');
                }
            } else if (submitStatusCode === '20000003') {
                throw new Error("Detected audio without content. Please speak again.");
            } else {
                throw new Error(`ByteDance API Error: ${submitMessage} (${submitStatusCode})`);
            }
        } else {
            throw new Error(`Unknown STT service provider: ${settings.stt_service_provider}`);
        }
    } catch (error) {
        console.error('Transcription error:', error);
        throw error;
    }
} 

// Helper function to poll ByteDance task result
async function pollByteDanceTaskResult(requestId, maxRetries = 10, retryInterval = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(`https://openspeech.bytedance.com/api/v3/auc/bigmodel/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-App-Key': getKey("BYTEDANCE_APP_ID"),
                    'X-Api-Access-Key': getKey("BYTEDANCE_APP_TOKEN"),
                    'X-Api-Resource-Id': 'volc.bigasr.auc',
                    'X-Api-Request-Id': requestId
                },
                body: JSON.stringify({})
            });
            
            const statusCode = response.headers.get('X-Api-Status-Code');
            const message = response.headers.get('X-Api-Message');
            
            if (statusCode === '20000000') {
                const result = await response.json();
                return result;
            } else if (statusCode === '20000001' || statusCode === '20000002') {
                console.log(`Processing, status code: ${statusCode}, continue querying...`);
                await new Promise(resolve => setTimeout(resolve, retryInterval));
                continue;
            } else if (statusCode === '20000003') {
                console.log('Detected audio without any content.');
                return { error: 'Audio without any content.' };
            } else if (statusCode === '55000031') {
                console.log('STT server is busy.');
                await new Promise(resolve => setTimeout(resolve, 2000)); 
                continue;
            } else {
                throw new Error(`API Error: ${message} (${statusCode})`);
            }
        } catch (error) {
            if (i === maxRetries - 1) {
                throw error;
            }
            console.log(`Query attempt ${i + 1} failed, retrying...`);
            await new Promise(resolve => setTimeout(resolve, retryInterval));
        }
    }
    
    throw new Error('Max retries reached while polling for transcription result');
}

function logoutAgent(agentName) {
    if (agentSockets[agentName]) {
        delete agentSockets[agentName];
        
        // Update agent status in database
        const agent = agentDatabase[agentName];
        if (agent) {
            agent.status = 'offline';
        }
        
        addAgentStatusLog(agentName, 'logout', 'warning', 'Agent logged out');
    }
}

function addCloudTable(name, type, description, initialData = null) {
    if (name in cloudDatabase) {
        console.warn(`Table ${name} already exists in cloud database`);
        return false;
    }

    if (type !== 'list' && type !== 'dict') {
        console.error(`Invalid table type: ${type}. Must be 'list' or 'dict'`);
        return false;
    }

    const table = {
        info: {
            type: type,
            name: name,
            description: description,
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString()
        },
        data: initialData || (type === 'list' ? [] : {})
    };

    cloudDatabase[name] = table;
    console.log(`Created cloud table: ${name} (${type})`);
    saveCloudDatabase();
    return true;
}

function getCloudTable(name) {
    const table = cloudDatabase[name];
    if (!table) {
        console.warn(`Table ${name} not found in cloud database`);
        return null;
    }
    return table;
}

function getCloudTableInfo(name) {
    const table = cloudDatabase[name];
    if (!table) {
        console.warn(`Table ${name} not found in cloud database`);
        return null;
    }
    return table.info;
}

function getCloudTableData(name) {
    const table = cloudDatabase[name];
    if (!table) {
        console.warn(`Table ${name} not found in cloud database`);
        return null;
    }
    return table.data;
}

function deleteCloudTable(name) {
    if (!cloudDatabase[name]) {
        console.warn(`Table ${name} not found in cloud database`);
        return false;
    }

    delete(cloudDatabase[name]);
    console.log(`Deleted cloud table: ${name}`);
    saveCloudDatabase();
    return true;
}

function updateCloudTableInfo(name, infoUpdates) {
    const table = cloudDatabase[name];
    if (!table) {
        console.warn(`Table ${name} not found in cloud database`);
        return false;
    }

    // Don't allow changing type or createdAt
    const { type, createdAt, ...allowedUpdates } = infoUpdates;
    
    Object.assign(table.info, allowedUpdates);
    table.info.lastModified = new Date().toISOString();
    
    console.log(`Updated cloud table info: ${name}`);
    saveCloudDatabase();
    return true;
}

function replaceCloudTableData(name, newData) {
    const table = cloudDatabase[name];
    if (!table) {
        console.warn(`Table ${name} not found in cloud database`);
        return false;
    }

    // Validate data type matches table type
    const expectedType = table.info.type;
    const isValidData = (expectedType === 'list' && Array.isArray(newData)) ||
                       (expectedType === 'map' && newData instanceof Map);

    if (!isValidData) {
        console.error(`Data type mismatch for table ${name}. Expected ${expectedType}, got ${typeof newData}`);
        return false;
    }

    table.data = newData;
    table.info.lastModified = new Date().toISOString();
    
    console.log(`Replaced data for cloud table: ${name}`);
    saveCloudDatabase();
    return true;
}

function listCloudTables() {
    let tables = [];
    for (let name in cloudDatabase) {
        const table = cloudDatabase[name];
        const tableEntry = {
            ...table.info,
            dataSize: table.info.type === 'list' ? table.data.length : Object.keys(table.data).length, 
        }
        tables.push(tableEntry);
    }
    return tables;
}

function cloudTableExists(name) {
    return name in cloudDatabase;
}

function clearCloudTableData(name) {
    const table = cloudDatabase[name];
    if (!table) {
        console.warn(`Table ${name} not found in cloud database`);
        return false;
    }

    if (table.info.type === 'list') {
        table.data = []; // Clear array
    } else {
        table.data = {}; // Clear map
    }

    table.info.lastModified = new Date().toISOString();
    console.log(`Cleared data for cloud table: ${name}`);
    saveCloudDatabase();
    return true;
}