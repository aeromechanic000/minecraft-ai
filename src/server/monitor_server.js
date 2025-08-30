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
import cors from 'cors';
import FormData from 'form-data';

// Module-level variables
let io;
let server;
const registeredAgents = new Set();
const agentManagers = {}; // socket for main process that registers/controls agents
const agentSockets = {}; 
const agentMessages = new Map(); // Store messages sent to agents
const agentStatusLogs = []; // Store status change logs
const pendingStatusRequests = new Map(); // Add this line for status requests
const actionLogs = []; // Store action logs

const prompter = new Prompter();

// New data structures for API functionality
const agentDatabase = new Map(); // Store detailed agent information

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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

    app.post('/api/monitor_query', async (req, res) => {
        try {
            const { query } = req.body;
            const result = await processMonitorQuery(query);
            res.json({
                success: true,
                data: {
                    actions: result.actions || [],
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
            
            const agent = agentDatabase.get(agentName);
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
            const agent = agentDatabase.get(agentName);
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
            const agent = Array.from(agentDatabase.values()).find(a => a.name === agentName);
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
                data: agentMessages.get(agentName) || [], 
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
            
            const agent = Array.from(agentDatabase.values()).find(a => a.name === agentName);
            if (!agent) {
                return res.status(404).json({
                    success: false,
                    error: "AGENT_NOT_FOUND",
                    message: "Agent not found"
                });
            }

            // Store the message
            if (!agentMessages.has(agentName)) {
                agentMessages.set(agentName, []);
            }
            
            const message = {
                id: Date.now(),
                message: command,
                timestamp: new Date().toLocaleTimeString(),
                sender: 'user',
                status: 'delivered'
            };
            
            agentMessages.get(agentName).unshift(message);
            
            // Keep only last 50 messages
            if (agentMessages.get(agentName).length > 50) {
                agentMessages.get(agentName).splice(50);
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

    // ==================== SOCKET.IO HANDLERS ====================

    // Socket.io connection handling
    io.on('connection', (socket) => {
        let curAgentName = null;
        console.log('Client connected:', socket.id);

        // Send initial data to newly connected client
        sendInitialData(socket);

        // Handle agent registration (from agent processes)
        socket.on('register-agents', (agentNames) => {
            console.log(`Registering agents: ${agentNames}`);
            agentNames.forEach(name => {
                registeredAgents.add(name);
                
                // Create agent entry in database if not exists
                if (!agentDatabase.has(name)) {
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
                    agentDatabase.set(name, agentData);
                }
            });
            
            for (let name of agentNames) {
                agentManagers[name] = socket;
            }
            
            socket.emit('register-agents-success');

            broadcastAgentsUpdate();
        });

        socket.on('login-agent', (agentName) => {
            if (agentSockets[agentName]) {
                console.warn(`Agent ${agentName} already logged in.`);
                return;
            }

            if (registeredAgents.has(agentName)) {
                agentSockets[agentName] = socket;
                // Update agent status in database
                const agent = agentDatabase.get(agentName);
                if (agent) {
                    agent.status = 'online';
                    agent.lastHeartbeat = new Date().toISOString();
                }
                
                broadcastAgentsUpdate();
                
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
            const request = pendingStatusRequests.get(requestId);
            if (request) {
                clearTimeout(request.timeout);
                pendingStatusRequests.delete(requestId);
                request.resolve(status); 
                if (status) {
                    addAgentStatusLog(status.name, 'status', 'success', 'Received update of agent status.');
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

// WebSocket data sender functions
function sendInitialData(socket) {
    sendAgentsData(socket);
    sendSystemStatus(socket);
    // sendAgentStatusLogs(socket, 50);
    // keysUpdate(socket);
}

// Helper function to format uptime
function formatUptime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function sendAgentsData(socket) {
    const agents = Array.from(agentDatabase.values()).map(agent => ({
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
    }));
    
    socket.emit('agents-update', agents);
}

function sendSystemStatus(socket) {
    const now = new Date();
    const systemStatus = {
        totalAgents: registeredAgents.size,
        activeAgents: Object.keys(agentManagers).length,
        serverStatus: 'Connected',
        uptime: now.toLocaleTimeString('en-GB', { hour12: false }),
        memoryUsage: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        tasksCompleted: Array.from(agentDatabase.values()).reduce((sum, agent) => sum + (agent.stats?.tasksCompleted || 0), 0)
    };
    
    socket.emit('system-status', systemStatus);
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

// Broadcast functions
function broadcastAgentsUpdate() {
    io.emit('agents-update', getAgentsUpdateData());
    io.sockets.sockets.forEach(socket => sendAgentsData(socket));
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
            pendingStatusRequests.delete(requestId);
            console.warn(`Request timeout for agent ${agentName}`); 
            resolve(null);
        }, 5000);

        pendingStatusRequests.set(requestId, { resolve, reject, timeout });
        
        if (agentSockets[agentName]) {
            agentSockets[agentName].emit('request-status', requestId);
        } else {
            clearTimeout(timeout);
            pendingStatusRequests.delete(requestId);
            console.warn(`Agent ${agentName} not connected`);
            resolve(null); 
        }
    });
}

async function updateAgentData(agentName) {
    try {
        const status = await requestAgentStatus(agentName);
        const agent = agentDatabase.get(agentName);
        if (agent) {
            Object.assign(agent, status);
            agentDatabase.set(agentName, agent);
        }
    } catch (error) {
        console.error("Error updating agent data:", error);
        throw error;
    }
}

function updateAgentDatabase() {
    registeredAgents.forEach(name => {
        updateAgentData(name);
    })
}

function getAgentsUpdateData() {
    updateAgentDatabase();
    let agents = [];
    registeredAgents.forEach(name => {
        const agentData = agentDatabase.get(name);
        agents.push({
            name, 
            id: agentData?.id,
            status: agentData?.status || 'offline',
            lastHeartbeat: agentData?.lastHeartbeat
        });
    });
    return agents;
}

async function processMonitorQuery(query) {
    let result = {text : "", actions : []};

    result.text = await prompter.promptMonitorQuery([], query)

    let [content, data] = splitContentAndJSON(result.text);
    if (data.text_response) {
        result.text = data.text_response;
    }

    if (data.actions && Array.isArray(data.actions)) {
        let actionLogUpdate = [];
        data.actions.forEach(action => {
            executeAction(action);
            actionLogUpdate.push({
                name: action.name,
                description : "The acition has been delivered.",
                params: action.params || {},
                status: "delivered",
                timestamp: new Date().toLocaleTimeString(),
            });
        });
        actionLogs.unshift(...actionLogUpdate);
        result.actions = actionLogUpdate;
    }
    console.log("Result of monitor query processing:", result);
    return result;
}

async function executeAction(action) {
    let actionLogUpdate = []
    actionLogUpdate.push({ 
        name: action.name,
        description : "The acition has finished.",
        params: action.params || {},
        status: "finished",
        timestamp: new Date().toLocaleTimeString(),
    })
    actionLogs.unshift(...actionLogUpdate);
    io.emit('action-log-update', actionLogUpdate);
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
        const agent = agentDatabase.get(agentName);
        if (agent) {
            agent.status = 'offline';
        }
        
        broadcastAgentsUpdate();
        addAgentStatusLog(agentName, 'logout', 'info', 'Agent logged out');
    }
}