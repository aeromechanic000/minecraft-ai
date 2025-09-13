import { Vec3 } from 'vec3';
import { readdirSync, readFileSync } from 'fs';
import * as skills from '../../agent/library/skills.js';
import * as world from '../../agent/library/world.js';
import * as mc from '../../utils/mcdata.js';

/**
 * Flashman plugin
 * 
 * Allows the bot to teleport to players or other bots
 * and then performs a dance
 * 
 */

export class PluginInstance {
    constructor(agent) {
        this.agent = agent;
    }

    init() {
    }

    async callPrompter(prompt) {
        let content = await this.agent.prompter.chat_model.sendRequest([], prompt);
        let data = this.extractDataBlock(content);
        return [content, data];
}


    extractDataBlock(str) {
        const regex = /```([\s\S]*?)```/g;
        const blocks = [];
        let match;

        while ((match = regex.exec(str)) !== null) {
        let data = match[1].trim();
            data = data.replace('json', '')
        blocks.push(data);
        }
        if (blocks.length === 0) {
        return [];
        } else {

        return blocks[0];
        }
    }
        

    getPluginActions() {
        return [
            {
                name: '!flash',
                description: 'flash or teleport to a place or an entity to travel faster or attack.',
                params: {
                    'enitityLocation': {type: 'string', description: 'the name of the player name to teleport to. do not use !goToPlayer.'},
                },

                perform : async function(agent, entityLocation) {
                    const requirement = "Perform a dance";
                    const prompt = `You are a skilled AI performer roleplaying as a evil bot that has superpowers that allows you to teleport named the Flashman in Minecraft, getting ready to use your superpower to flash to a player, hit them, flash away, then come back and do a taunting dance to make the player angry. Do a lot of sneaking and standing up again while turning your back to the player, do not inculde tps in the middle of sneaking and standing patterns. Create the dance sequence as a JSON list of steps, considering the following requirement:
                        Each step must be a JSON object with:
                        - "name" — the move name, one of: "forward", "back", "right", "left", "jump", "sprint", "sneak", "swing", "nod", "shake", "chat","tp".
                        - "duration" — integer milliseconds for how long to perform the move (omit or set to 0 if duration is not applicable).
                        (tp meaning teleport)

                        The output must be only a valid JSON array (no extra text, no explanations, no json at the head). Moves should be arranged to create a rhythmic and thematic dance matching the taunting dance to make the player angry. Example format (not actual output):


                        \`\`\`
                        [
                        {"name": "forward", "duration": 1000},
                        {"name": "jump", "duration": 500},
                        {"name": "chat", "duration": 0}
                        ]
                        \`\`\`

                        `
                                                        
                    let [content, data] = await agent.plugin.plugins["Flashman"].callPrompter(prompt);
                    const steps = JSON.parse(data)
                    
                 
                 
                for(let step of steps){
                    console.log("step:", step)
                    if(["forward", "left", "right", "back", "jump","sneak"].includes(step["name"])){
                        agent.bot.setControlState(step["name"], true);
                        await new Promise ((resolve)=>setTimeout (resolve,step["duration"]));
                        agent.bot.setControlState(step["name"], false);
                    }else if(step["name"] === "chat"){
                        agent.bot.chat("me name is max")
                    }else if(step["name"] === "summonLightningBolt"){
                        agent.bot.chat("/summon minecraft:lightning_bolt");
                    }else if(step["name"] === "nod"){
                        agent.bot.look(20,0,false);
                        agent.bot.look(-20,0,false);
                        agent.bot.look(0,0,false);
                    }else if(step["name"] === "tp"){
                        agent.bot.chat("tp")
                        agent.bot.chat("/tp " + entityLocation);
                    }
                }
                
                    
            }
            },
        ]
    }
}