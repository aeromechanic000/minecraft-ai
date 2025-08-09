import { Vec3 } from 'vec3';
import fs from 'fs';
import { Camera } from "../../agent/camera.js";

export class PluginInstance {
    constructor(agent) {
        this.agent = agent;
        this.fp = './bots/'+agent.name+'/screenshots/';
        this.camera = new Camera(this.agent.bot, this.fp);
    }

    init() {
    }

    getPluginActions() {
        return [
            {
                name: '!lookAtPlayer',
                description: 'Look at a player or look in the same direction as the player.',
                params: {
                    'player_name': { type: 'string', description: 'Name of the target player' },
                    'direction': {
                        type: 'string',
                        description: 'How to look ("at": look at the player, "with": look in the same direction as the player)',
                    }
                },
                perform: async function(agent, player_name, direction) {
                    if (direction !== 'at' && direction !== 'with') {
                        return "Invalid direction. Use 'at' or 'with'.";
                    }
                    let result = "";
                    const actionFn = async () => {
                        result = await agent.plugin.plugins["VisionInterpreter"].lookAtPlayer(player_name, direction);
                    };
                    await agent.actions.runAction('action:lookAtPlayer', actionFn);
                    return result;
                }
            },
            {
                name: '!lookAtPosition',
                description: 'Look at specified coordinates.',
                params: {
                    'x': { type: 'int', description: 'x coordinate' },
                    'y': { type: 'int', description: 'y coordinate' },
                    'z': { type: 'int', description: 'z coordinate' }
                },
                perform: async function(agent, x, y, z) {
                    let result = "";
                    const actionFn = async () => {
                        result = await agent.plugin.plugins["VisionInterpreter"].lookAtPosition(x, y, z);
                    };
                    await agent.actions.runAction('action:lookAtPosition', actionFn);
                    return result;
                }
            },
        ];
    }

    async lookAtPlayer(player_name, direction) {
        if (!this.agent.prompter.vision_model.sendVisionRequest) {
            return "Vision is disabled. Use other methods to describe the environment.";
        }
        let result = "";
        const bot = this.agent.bot;
        const player = bot.players[player_name]?.entity;
        if (!player) {
            return `Could not find player ${player_name}`;
        }

        let filename;
        if (direction === 'with') {
            await bot.look(player.yaw, player.pitch);
            result = `Looking in the same direction as ${player_name}\n`;
            filename = await this.camera.capture();
        } else {
            await bot.lookAt(new Vec3(player.position.x, player.position.y + player.height, player.position.z));
            result = `Looking at player ${player_name}\n`;
            filename = await this.camera.capture();

        }

        return result + `Image analysis: "${await this.analyzeImage(filename)}"`;
    }

    async lookAtPosition(x, y, z) {
        if (!this.agent.prompter.vision_model.sendVisionRequest) {
            return "Vision is disabled. Use other methods to describe the environment.";
        }
        let result = "";
        const bot = this.agent.bot;
        await bot.lookAt(new Vec3(x, y + 2, z));
        result = `Looking at coordinate ${x}, ${y}, ${z}\n`;

        let filename = await this.camera.capture();

        return result + `Image analysis: "${await this.analyzeImage(filename)}"`;
    }

    getCenterBlockInfo() {
        const bot = this.agent.bot;
        const maxDistance = 128; // Maximum distance to check for blocks
        const targetBlock = bot.blockAtCursor(maxDistance);
        
        if (targetBlock) {
            return `Block at center view: ${targetBlock.name} at (${targetBlock.position.x}, ${targetBlock.position.y}, ${targetBlock.position.z})`;
        } else {
            return "No block in center view";
        }
    }

    async analyzeImage(filename) {
        try {
            const imageBuffer = fs.readFileSync(`${this.fp}/${filename}.jpg`);
            const messages = this.agent.history.getHistory();

            const blockInfo = this.getCenterBlockInfo();
            const result = await this.promptVision(messages, imageBuffer);
            return result + `\n${blockInfo}`;

        } catch (error) {
            console.warn('Error reading image:', error);
            return `Error reading image: ${error.message}`;
        }
    }
    
    async promptVision(messages, imageBuffer) {
        await this.agent.prompter.checkCooldown();

        let prompt = "You are a Minecraft bot named $NAME that has been given a screenshot of your current view. Analyze and summarize the view; describe terrain, blocks, entities, structures, and notable features. Focus on details relevant to the conversation. Note: the sky is always blue regardless of weather or time, dropped items are small pink cubes, and blocks below y=0 do not render. Be extremely concise and correct, respond only with your analysis, not conversationally. $STATS";

        prompt = await this.agent.prompter.replaceStrings(prompt, messages, null, null, null);
        return await this.agent.prompter.enhancer.sendVisionRequest(this.agent.prompter.vision_model, messages, prompt, imageBuffer);
    }
} 