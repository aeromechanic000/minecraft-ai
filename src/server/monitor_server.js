import { Server } from 'socket.io';
import { getKey, hasKey } from '../utils/keys.js';
import settings from '../../settings.js';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import cors_proxy from 'cors-anywhere';

// Module-level variables
let io;
let server;
const registeredAgents = new Set();
const inGameAgents = {};
const agentManagers = {}; // socket for main process that registers/controls agents

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
export function createMindServer(port = 8080) {
    const app = express();
    server = http.createServer(app);
    io = new Server(server);

    // Middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Serve static files
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    app.use(express.static(path.join(__dirname, 'public')));

    // ==================== REST API ENDPOINTS ====================

    // 8.1 Register New Agent
    app.post('/api/agents/register', (req, res) => {
        try {
            const { name, uuid, type, spawnLocation, capabilities, gameMode, initialInventory } = req.body;
            
            // Validate input
            if (!name || !uuid) {
                return res.status(400).json({
                    success: false,
                    error: "INVALID_INPUT",
                    message: "Agent name and UUID are required"
                });
            }

            // Check if agent already exists
            if (registeredAgents.has(name) || Array.from(agentDatabase.values()).some(agent => agent.uuid === uuid)) {
                return res.status(409).json({
                    success: false,
                    error: "AGENT_ALREADY_EXISTS",
                    message: "Agent with this name or UUID already registered"
                });
            }

            // Check agent limit
            if (registeredAgents.size >= systemConfig.maxAgents) {
                return res.status(429).json({
                    success: false,
                    error: "AGENT_LIMIT_REACHED",
                    message: "Maximum number of agents reached"
                });
            }

            // Create agent record
            const agentId = Date.now(); // Simple ID generation
            const apiKey = `agent_key_${Math.random().toString(36).substr(2, 9)}`;
            
            const agentData = {
                id: agentId,
                name,
                uuid,
                type: type || "autonomous",
                spawnLocation: spawnLocation || { x: 0, y: 64, z: 0, dimension: "overworld" },
                capabilities: capabilities || [],
                gameMode: gameMode || "survival",
                initialInventory: initialInventory || {},
                status: "offline",
                registeredAt: new Date().toISOString(),
                apiKey,
                lastHeartbeat: null,
                currentTask: null,
                stats: {
                    totalPlayTime: 0,
                    tasksCompleted: 0,
                    blocksPlaced: 0,
                    blocksBroken: 0
                }
            };

            agentDatabase.set(name, agentData);
            registeredAgents.add(name);

            res.json({
                success: true,
                data: {
                    id: agentId,
                    name,
                    uuid,
                    status: "offline",
                    registeredAt: agentData.registeredAt,
                    apiKey
                }
            });

            // Broadcast update
            agentsUpdate();

        } catch (error) {
            console.error('Error registering agent:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to register agent"
            });
        }
    });

    // 8.2 Unregister Agent
    app.delete('/api/agents/:agentId/unregister', (req, res) => {
        try {
            const agentId = parseInt(req.params.agentId);
            
            // Find agent by ID
            const agent = Array.from(agentDatabase.values()).find(a => a.id === agentId);
            if (!agent) {
                return res.status(404).json({
                    success: false,
                    error: "AGENT_NOT_FOUND",
                    message: "Agent not found"
                });
            }

            // Remove agent from all data structures
            registeredAgents.delete(agent.name);
            agentDatabase.delete(agent.name);
            delete inGameAgents[agent.name];
            delete agentManagers[agent.name];

            res.json({
                success: true,
                message: "Agent successfully unregistered",
                data: {
                    finalStats: agent.stats
                }
            });

            // Broadcast update
            agentsUpdate();

        } catch (error) {
            console.error('Error unregistering agent:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to unregister agent"
            });
        }
    });

    // 8.3 Update Agent Status (Heartbeat)
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

    // 11.1 Get Agent Performance
    app.get('/api/agents/:agentId/analytics', (req, res) => {
        try {
            const agentId = parseInt(req.params.agentId);
            const { period = 'day', metrics } = req.query;
            
            const agent = Array.from(agentDatabase.values()).find(a => a.id === agentId);
            if (!agent) {
                return res.status(404).json({
                    success: false,
                    error: "AGENT_NOT_FOUND",
                    message: "Agent not found"
                });
            }

            // TODO: Implement actual analytics calculation based on stored data
            const mockMetrics = {
                uptime: "23:45:30",
                tasksCompleted: agent.stats.tasksCompleted || 0,
                tasksFailedRate: 0.067,
                averageTaskDuration: "00:18:30",
                blocksPlaced: agent.stats.blocksPlaced || 0,
                blocksBroken: agent.stats.blocksBroken || 0,
                distanceTraveled: 5420.5,
                experienceGained: 345,
                deathCount: 2,
                efficiency: 0.92
            };

            res.json({
                success: true,
                data: {
                    agentId,
                    period,
                    metrics: mockMetrics,
                    hourlyBreakdown: [] // TODO: Implement hourly breakdown
                }
            });

        } catch (error) {
            console.error('Error getting agent analytics:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to get agent analytics"
            });
        }
    });

    // 11.2 Get System Analytics
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

    // 12.1 Get System Configuration
    app.get('/api/config', (req, res) => {
        res.json({
            success: true,
            data: systemConfig
        });
    });

    // 12.2 Update System Configuration
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

    // 13.1 Create Agent Backup
    app.post('/api/agents/:agentId/backup', (req, res) => {
        try {
            const agentId = parseInt(req.params.agentId);
            
            const agent = Array.from(agentDatabase.values()).find(a => a.id === agentId);
            if (!agent) {
                return res.status(404).json({
                    success: false,
                    error: "AGENT_NOT_FOUND",
                    message: "Agent not found"
                });
            }

            // TODO: Implement actual backup creation
            const backupId = `backup_${Date.now()}`;
            const backup = {
                backupId,
                agentState: {
                    inventory: agent.currentState?.inventory || {},
                    location: agent.currentState?.coordinates || agent.spawnLocation,
                    experience: agent.currentState?.experience || 0,
                    health: agent.currentState?.health || 20
                },
                createdAt: new Date().toISOString()
            };

            res.json({
                success: true,
                data: backup
            });

        } catch (error) {
            console.error('Error creating backup:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to create backup"
            });
        }
    });

    // 13.2 Restore Agent from Backup
    app.post('/api/agents/:agentId/restore', (req, res) => {
        try {
            const agentId = parseInt(req.params.agentId);
            const { backupId, restoreInventory, restoreLocation, restoreExperience } = req.body;
            
            const agent = Array.from(agentDatabase.values()).find(a => a.id === agentId);
            if (!agent) {
                return res.status(404).json({
                    success: false,
                    error: "AGENT_NOT_FOUND",
                    message: "Agent not found"
                });
            }

            // TODO: Implement actual restore logic
            // This would involve sending commands to the Minecraft server
            // to restore the agent's state

            res.json({
                success: true,
                message: "Agent restored successfully from backup",
                data: {
                    backupId,
                    restoredAt: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('Error restoring agent:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to restore agent"
            });
        }
    });

    // Get all agents
    app.get('/api/agents', (req, res) => {
        try {
            const agents = Array.from(agentDatabase.values()).map(agent => ({
                id: agent.id,
                name: agent.name,
                status: agent.status,
                lastHeartbeat: agent.lastHeartbeat,
                currentTask: agent.currentTask,
                registeredAt: agent.registeredAt
            }));

            res.json({
                success: true,
                data: agents
            });
        } catch (error) {
            console.error('Error getting agents:', error);
            res.status(500).json({
                success: false,
                error: "INTERNAL_ERROR",
                message: "Failed to get agents"
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

    // ==================== SOCKET.IO HANDLERS ====================

    // Socket.io connection handling
    io.on('connection', (socket) => {
        let curAgentName = null;
        console.log('Client connected');

        agentsUpdate(socket);
        keysUpdate(socket);
        portsUpdate(socket);

        socket.on('register-agents', (agentNames) => {
            console.log(`Registering agents: ${agentNames}`);
            agentNames.forEach(name => registeredAgents.add(name));
            for (let name of agentNames) {
                agentManagers[name] = socket;
            }
            socket.emit('register-agents-success');
            agentsUpdate();
        });

        socket.on('login-agent', (agentName) => {
            if (curAgentName && curAgentName !== agentName) {
                console.warn(`Agent ${agentName} already logged in as ${curAgentName}`);
                return;
            }
            if (registeredAgents.has(agentName)) {
                curAgentName = agentName;
                inGameAgents[agentName] = socket;
                
                // Update agent status in database
                const agent = agentDatabase.get(agentName);
                if (agent) {
                    agent.status = 'online';
                    agent.lastHeartbeat = new Date().toISOString();
                }
                
                agentsUpdate();
            } else {
                console.warn(`Agent ${agentName} not registered`);
            }
        });

        socket.on('logout-agent', (agentName) => {
            if (inGameAgents[agentName]) {
                delete inGameAgents[agentName];
                
                // Update agent status in database
                const agent = agentDatabase.get(agentName);
                if (agent) {
                    agent.status = 'offline';
                }
                
                agentsUpdate();
            }
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected');
            if (inGameAgents[curAgentName]) {
                delete inGameAgents[curAgentName];
                
                // Update agent status in database
                const agent = agentDatabase.get(curAgentName);
                if (agent) {
                    agent.status = 'offline';
                }
                
                agentsUpdate();
            }
        });

        socket.on('chat-message', (agentName, json) => {
            if (!inGameAgents[agentName]) {
                console.warn(`Agent ${agentName} tried to send a message but is not logged in`);
                return;
            }
            console.log(`${curAgentName} sending message to ${agentName}: ${json.message}`);
            inGameAgents[agentName].emit('chat-message', curAgentName, json);
        });

        socket.on('restart-agent', (agentName) => {
            console.log(`Restarting agent: ${agentName}`);
            inGameAgents[agentName].emit('restart-agent');
        });

        socket.on('stop-agent', (agentName) => {
            let manager = agentManagers[agentName];
            if (manager) {
                manager.emit('stop-agent', agentName);
            }
            else {
                console.warn(`Stopping unregisterd agent ${agentName}`);
            }
        });

        socket.on('start-agent', (agentName) => {
            let manager = agentManagers[agentName];
            if (manager) {
                manager.emit('start-agent', agentName);
            }
            else {
                console.warn(`Starting unregisterd agent ${agentName}`);
            }
        });

        socket.on('stop-all-agents', () => {
            console.log('Killing all agents');
            stopAllAgents();
        });

        socket.on('shutdown', () => {
            console.log('Shutting down');
            for (let manager of Object.values(agentManagers)) {
                manager.emit('shutdown');
            }
            setTimeout(() => {
                process.exit(0);
            }, 2000);
        });

        socket.on('send-message', (agentName, message) => {
            if (!inGameAgents[agentName]) {
                console.warn(`Agent ${agentName} not logged in, cannot send message via MindServer.`);
                return
            }
            try {
                console.log(`Sending message to agent ${agentName}: ${message}`);
                inGameAgents[agentName].emit('send-message', agentName, message)
            } catch (error) {
                console.error('Error: ', error);
            }
        });
    });

    server.listen(port, 'localhost', () => {
        console.log(`MindServer running on port ${port}`);
    });

    return server;
}

function agentsUpdate(socket) {
    if (!socket) {
        socket = io;
    }
    let agents = [];
    registeredAgents.forEach(name => {
        const agentData = agentDatabase.get(name);
        agents.push({
            name, 
            in_game: !!inGameAgents[name],
            id: agentData?.id,
            status: agentData?.status || 'offline',
            lastHeartbeat: agentData?.lastHeartbeat
        });
    });
    socket.emit('agents-update', agents);
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

function portsUpdate(socket) {
    if (!socket) {
        socket = io;
    }
    let ports = {
        "proxy" : settings.proxyserver_port,
        "mind" : settings.mindserver_port,
    };
    socket.emit('ports-update', ports);
}

function stopAllAgents() {
    for (const agentName in inGameAgents) {
        let manager = agentManagers[agentName];
        if (manager) {
            manager.emit('stop-agent', agentName);
        }
    }
}

// Optional: export these if you need access to them from other files
export const getIO = () => io;
export const getServer = () => server;
export const getConnectedAgents = () => inGameAgents;
export const getAgentDatabase = () => agentDatabase;
export const getTaskDatabase = () => taskDatabase;