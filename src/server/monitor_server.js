import { Server } from 'socket.io';
import { getKey, hasKey } from '../utils/keys.js';
import settings from '../../settings.js';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import cors_proxy from 'cors-anywhere';
import cors from 'cors';


// Module-level variables
let io;
let server;
const registeredAgents = new Set();
const agentManagers = {}; // socket for main process that registers/controls agents
const agentSockets = {}; 
const agentMessages = new Map(); // Store messages sent to agents
const actionLogs = []; // Store action logs for frontend
const agentStatusLogs = []; // Store status change logs
const pendingStatusRequests = new Map(); // Add this line for status requests

// New data structures for API functionality
const agentDatabase = new Map(); // Store detailed agent information
const taskDatabase = new Map(); // Store task information
const eventLog = []; // Store system events
const systemConfig = {
    maxAgents: 10,
    taskQueueLimit: 100,
    heartbeatInterval: 30,
    autoRestartAgents: true,
    safetyMode: true,
    allowedBlocks: {
        canBreak: ["stone", "dirt", "wood", "ore"],
        canPlace: ["cobblestone", "wood_planks", "glass"]
    },
    restrictedAreas: []
};

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

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Serve static files
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    app.use(express.static(path.join(__dirname, 'public')));

    // ==================== REST API ENDPOINTS ====================

    app.put('/api/agents/:agentId/heartbeat', (req, res) => {
        try {
            const agentId = parseInt(req.params.agentId);
            const heartbeatData = req.body;
            
            // Find agent by ID
            const agent = Array.from(agentDatabase.values()).find(a => a.id === agentId);
            if (!agent) {
                return res.status(404).json({
                    success: false,
                    error: "AGENT_NOT_FOUND",
                    message: "Agent not found"
                });
            }

            // Update agent data with heartbeat information
            agent.lastHeartbeat = new Date().toISOString();
            agent.status = "online";
            agent.currentState = heartbeatData;

            // TODO: Implement command queue system
            const commands = []; // Placeholder for commands to send back to agent

            res.json({
                success: true,
                data: {
                    acknowledged: true,
                    nextHeartbeat: new Date(Date.now() + systemConfig.heartbeatInterval * 1000).toISOString(),
                    commands
                }
            });

        } catch (error) {
            console.error('Error processing heartbeat:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to process heartbeat"
            });
        }
    });

    // 9.1 Agent Event Notification
    app.post('/api/events/agent', (req, res) => {
        try {
            const { agentId, eventType, data, timestamp } = req.body;
            
            // Validate input
            if (!agentId || !eventType) {
                return res.status(400).json({
                    success: false,
                    error: "INVALID_INPUT",
                    message: "AgentId and eventType are required"
                });
            }

            // Store event
            const event = {
                id: Date.now(),
                agentId,
                eventType,
                data,
                timestamp: timestamp || new Date().toISOString()
            };
            
            eventLog.push(event);
            
            // Keep only last 1000 events
            if (eventLog.length > 1000) {
                eventLog.shift();
            }

            // TODO: Implement event processing logic based on eventType
            // Update agent stats, trigger alerts, etc.

            // Broadcast event via WebSocket
            io.emit('agent-event', event);

            res.json({ success: true, message: "Event recorded" });

        } catch (error) {
            console.error('Error processing agent event:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to process event"
            });
        }
    });

    // 9.2 System Event Broadcast
    app.post('/api/events/system', (req, res) => {
        try {
            const { eventType, severity, message, affectedAgents, data, timestamp } = req.body;
            
            const event = {
                id: Date.now(),
                type: 'system',
                eventType,
                severity: severity || 'info',
                message,
                affectedAgents: affectedAgents || [],
                data,
                timestamp: timestamp || new Date().toISOString()
            };
            
            eventLog.push(event);
            
            // Broadcast system event
            io.emit('system-event', event);

            res.json({ success: true, message: "System event broadcasted" });

        } catch (error) {
            console.error('Error broadcasting system event:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to broadcast event"
            });
        }
    });

    // 10.1 Create Task
    app.post('/api/tasks', (req, res) => {
        try {
            const { name, type, priority, assignedAgent, parameters, timeout, retryLimit } = req.body;
            
            // Validate input
            if (!name || !type) {
                return res.status(400).json({
                    success: false,
                    error: "INVALID_INPUT",
                    message: "Task name and type are required"
                });
            }

            // Check task queue limit
            if (taskDatabase.size >= systemConfig.taskQueueLimit) {
                return res.status(429).json({
                    success: false,
                    error: "TASK_QUEUE_FULL",
                    message: "Task queue has reached maximum capacity"
                });
            }

            // Create task
            const taskId = `task_${Date.now()}`;
            const task = {
                id: taskId,
                name,
                type,
                priority: priority || 'medium',
                assignedAgent,
                parameters: parameters || {},
                timeout: timeout || 3600,
                retryLimit: retryLimit || 3,
                status: 'queued',
                progress: 0,
                createdAt: new Date().toISOString(),
                startedAt: null,
                completedAt: null,
                results: {},
                logs: []
            };

            taskDatabase.set(taskId, task);

            // TODO: Implement task scheduling and assignment logic

            res.json({
                success: true,
                data: {
                    taskId,
                    status: 'queued',
                    estimatedDuration: "00:45:00", // TODO: Calculate based on task type
                    queuePosition: taskDatabase.size,
                    createdAt: task.createdAt
                }
            });

        } catch (error) {
            console.error('Error creating task:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to create task"
            });
        }
    });

    // 10.2 Get Task Status
    app.get('/api/tasks/:taskId', (req, res) => {
        try {
            const taskId = req.params.taskId;
            const task = taskDatabase.get(taskId);
            
            if (!task) {
                return res.status(404).json({
                    success: false,
                    error: "TASK_NOT_FOUND",
                    message: "Task not found"
                });
            }

            // Get assigned agent info
            let assignedAgentInfo = null;
            if (task.assignedAgent) {
                const agent = Array.from(agentDatabase.values()).find(a => a.id === task.assignedAgent);
                if (agent) {
                    assignedAgentInfo = { id: agent.id, name: agent.name };
                }
            }

            res.json({
                success: true,
                data: {
                    ...task,
                    assignedAgent: assignedAgentInfo,
                    estimatedCompletion: task.startedAt ? 
                        new Date(new Date(task.startedAt).getTime() + task.timeout * 1000).toISOString() : 
                        null
                }
            });

        } catch (error) {
            console.error('Error getting task status:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to get task status"
            });
        }
    });

    // 10.3 Cancel Task
    app.delete('/api/tasks/:taskId', (req, res) => {
        try {
            const taskId = req.params.taskId;
            const task = taskDatabase.get(taskId);
            
            if (!task) {
                return res.status(404).json({
                    success: false,
                    error: "TASK_NOT_FOUND",
                    message: "Task not found"
                });
            }

            // Update task status
            task.status = 'cancelled';
            task.completedAt = new Date().toISOString();

            // TODO: Send cancellation signal to agent if task is executing

            res.json({
                success: true,
                message: "Task cancelled successfully",
                data: {
                    partialResults: task.results
                }
            });

        } catch (error) {
            console.error('Error cancelling task:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to cancel task"
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

    app.get('/api/analytics/system', (req, res) => {
        try {
            const { period = 'day' } = req.query;
            
            // TODO: Implement actual system analytics calculation
            const mockAnalytics = {
                period,
                totalAgents: registeredAgents.size,
                averageUptime: "22:30:15",
                totalTasksCompleted: Array.from(agentDatabase.values()).reduce((sum, agent) => sum + (agent.stats.tasksCompleted || 0), 0),
                systemEfficiency: 0.89,
                resourcesGathered: {
                    wood: 1500,
                    stone: 2800,
                    iron_ore: 350,
                    diamond: 15
                },
                structuresBuilt: {
                    houses: 3,
                    bridges: 1,
                    farms: 2
                },
                agentPerformance: Array.from(agentDatabase.values()).map(agent => ({
                    agentId: agent.id,
                    name: agent.name,
                    efficiency: 0.95, // TODO: Calculate actual efficiency
                    tasksCompleted: agent.stats.tasksCompleted || 0
                }))
            };

            res.json({
                success: true,
                data: mockAnalytics
            });

        } catch (error) {
            console.error('Error getting system analytics:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to get system analytics"
            });
        }
    });

    app.get('/api/config', (req, res) => {
        res.json({
            success: true,
            data: systemConfig
        });
    });

    app.put('/api/config', (req, res) => {
        try {
            const updates = req.body;
            
            // Merge updates with existing config
            Object.assign(systemConfig, updates);
            
            res.json({
                success: true,
                message: "Configuration updated successfully",
                data: systemConfig
            });

        } catch (error) {
            console.error('Error updating configuration:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to update configuration"
            });
        }
    });

    // Get all tasks
    app.get('/api/tasks', (req, res) => {
        try {
            const tasks = Array.from(taskDatabase.values());
            res.json({
                success: true,
                data: tasks
            });
        } catch (error) {
            console.error('Error getting tasks:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to get tasks"
            });
        }
    });

    // Get events
    app.get('/api/events', (req, res) => {
        try {
            const { limit = 100, type } = req.query;
            let events = eventLog;
            
            if (type) {
                events = events.filter(event => event.eventType === type);
            }
            
            events = events.slice(-limit);
            
            res.json({
                success: true,
                data: events
            });
        } catch (error) {
            console.error('Error getting events:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to get events"
            });
        }
    });

    app.get('/api/system/status', (req, res) => {
        try {
            const systemStatus = {
                totalAgents: registeredAgents.size,
                activeAgents: Object.keys(inGameAgents).length,
                serverStatus: 'Connected',
                uptime: process.uptime() ? formatUptime(process.uptime()) : '0:00:00',
                memoryUsage: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
                tasksCompleted: Array.from(agentDatabase.values()).reduce((sum, agent) => sum + (agent.stats?.tasksCompleted || 0), 0)
            };

            res.json({
                success: true,
                data: systemStatus
            });
        } catch (error) {
            console.error('Error getting system status:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to get system status"
            });
        }
    });

    // Minecraft server info
    app.get('/api/minecraft/server', (req, res) => {
        try {
            res.json({
                success: true,
                data: {
                    serverStatus: 'online',
                    playerCount: Object.keys(inGameAgents).length,
                    maxPlayers: systemConfig.maxAgents,
                    version: '1.20.1',
                    motd: 'AI Agent Server'
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to get server info"
            });
        }
    });

    // Action logs
    app.get('/api/logs/actions', (req, res) => {
        try {
            const { limit = 50 } = req.query;
            const logs = actionLogs.slice(0, parseInt(limit));
            
            res.json({
                success: true,
                data: {
                    logs: logs
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to get action logs"
            });
        }
    });

    // Agent status logs  
    app.get('/api/logs/agent-status', (req, res) => {
        try {
            const { limit = 50 } = req.query;
            const logs = agentStatusLogs.slice(0, parseInt(limit));
            
            res.json({
                success: true,
                data: {
                    logs: logs
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to get agent status logs"
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
            broadcastSystemStatus();
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
                broadcastSystemStatus();
                
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
    sendActionLogs(socket, 50);
    sendAgentStatusLogs(socket, 50);
    sendTasksData(socket);
    keysUpdate(socket);
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

function sendActionLogs(socket, limit = 50) {
    const logs = actionLogs.slice(0, parseInt(limit));
    socket.emit('action-logs', logs);
}

function sendAgentStatusLogs(socket, limit = 50) {
    const logs = agentStatusLogs.slice(0, parseInt(limit));
    socket.emit('agent-status-logs', logs);
}

function sendTasksData(socket) {
    const tasks = Array.from(taskDatabase.values());
    socket.emit('tasks-data', tasks);
}

function sendEventsData(socket, limit = 100, type = null) {
    let events = eventLog;
    
    if (type) {
        events = events.filter(event => event.eventType === type);
    }
    
    events = events.slice(-limit);
    socket.emit('events-data', events);
}

// Broadcast functions
function broadcastAgentsUpdate() {
    io.emit('agents-update', getAgentsUpdateData());
    io.sockets.sockets.forEach(socket => sendAgentsData(socket));
}

function broadcastSystemStatus() {
    io.sockets.sockets.forEach(socket => sendSystemStatus(socket));
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

function keysUpdate(socket) {
    if (!socket) {
        socket = io;
    }
    let keys = {
        "BYTEDANCE_APP_ID" : getKey("BYTEDANCE_APP_ID"),
        "BYTEDANCE_APP_TOKEN" : getKey("BYTEDANCE_APP_TOKEN"),
        "OPENAI_API_KEY" : getKey("OPENAI_API_KEY"),
    };
    socket.emit('keys-update', keys);
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
        broadcastSystemStatus();
        
        // Add status log
        addAgentStatusLog(agentName, 'logout', 'info', 'Agent logged out');
    }
}

function stopAllAgents() {
    for (const agentName in agentManagers) {
        let manager = agentManagers[agentName];
        if (manager) {
            manager.emit('stop-agent', agentName);
        }
    }
}