import { io } from 'socket.io-client';
import convoManager from './conversation.js';
import settings from '../../settings.js';

class AgentServerProxy {
    constructor() {
        if (AgentServerProxy.instance) {
            return AgentServerProxy.instance;
        }
        
        this.socket = null;
        this.connected = false;
        AgentServerProxy.instance = this;
    }

    connect(agent) {
        if (this.connected) return;
        
        this.agent = agent;

        this.socket = io(`http://${settings.monitor_server_host}:${settings.monitor_server_port}`);
        this.connected = true;

        this.socket.on('connect', () => {
            console.log('Connected to MonitorServer');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from MonitorServer');
            this.connected = false;
        });

        this.socket.on('chat-message', (agentName, json) => {
            convoManager.receiveFromBot(agentName, json);
        });

        this.socket.on('agents-update', (agents) => {
            convoManager.updateAgents(agents);
        });

		this.socket.on('send-message', (agentName, message) => {
			try {
				this.agent.respondFunc(agentName, message);
			} catch (error) {
				console.error('Error: ', JSON.stringify(error, Object.getOwnPropertyNames(error)));
			}
		});

        this.socket.on('request-status', (requestId) => {
            try {
                const status = {
                    name : this.agent.name,
                    status: 'online',
                    health: this.agent.bot.health,
                    maxHealth: 20,
                    hunger: this.agent.bot.hunger,
                    experience: this.agent.bot.experience.points,
                    gameMode: this.agent.bot.game.gameMode,
                    dimension: this.agent.bot.game.dimension,
                    coordinates: { 
                        x: Math.floor(this.agent.bot.entity.position.x), 
                        y: Math.floor(this.agent.bot.entity.position.y), 
                        z: Math.floor(this.agent.bot.entity.position.z), 
                    },
                    biome: 'plains',
                    task: null,
                    registeredAt: new Date().toISOString(),
                    lastHeartbeat: new Date().toISOString(),
                    stats: {
                        totalPlayTime: 0,
                        tasksCompleted: 0,
                        blocksPlaced: 0,
                        blocksBroken: 0
                    }
                };
                this.socket.emit('status-response', requestId, status);
            } catch (error) {
                this.socket.emit('status-error', requestId, error.message);
            }
        });
    }

    login() {
        this.socket.emit('login-agent', this.agent.name, this.agent.count_id);
    }

    shutdown() {
        this.socket.emit('shutdown');
    }

    getSocket() {
        return this.socket;
    }
}

// Create and export a singleton instance
export const serverProxy = new AgentServerProxy();

export function sendBotChatToServer(agentName, json) {
    serverProxy.getSocket().emit('chat-message', agentName, json);
}
