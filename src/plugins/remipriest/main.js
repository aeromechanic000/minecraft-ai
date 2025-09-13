import { Vec3 } from 'vec3';
import { readdirSync, readFileSync } from 'fs';
import * as skills from '../../agent/library/skills.js';
import * as world from '../../agent/library/world.js';
import * as mc from '../../utils/mcdata.js';

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
        const data = match[1].trim();
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
                name: '!remipriest',
                description: 'when user typed rain the weather will be changed to rain',
                params: {'name': { type: 'string', description: 'The name to remember the location as.' }},
                perform: async function (agent, name) {
                    console.log('prey for rain')
                    agent.bot.chat('I am Remi the Great Priest, I can tell you the weather in your area, just say "remi weather" and I will tell you the weather in your area')  
                    agent.bot.chat('I can also tell you the time, just say "remi time" and I will tell you the time')
                    agent.bot.chat('I can also tell you the location of the nearest village, just say "remi village" and I will tell you the location of the nearest village')
                    agent.bot.chat('I can also tell you the location of the nearest town, just say "remi town" and I will tell you the location of the nearest town')
                    agent.bot.chat('I can also tell you the location of the nearest city, just say "remi city" and I will tell you the location of the nearest city')
                    agent.bot.chat('I can also tell you the location of the nearest castle, just say "remi castle" and I will tell you the location of the nearest castle')
                    agent.bot.chat('I can also tell you the location of the nearest farm, just say "remi farm" and I will tell you the location of the nearest farm')
                    const requirement = "Perform a dance";
                    const prompt = `
                    You are a skilled AI performer roleplaying as the High Priest in Minecraft, perf
                    orming a ceremonial dance for either praying for rain or praying for clear weat
                    her. Create a dance sequence as a JSON list of steps, considering the followin
                    g requirement: ${requirement}. Each step must be a JSON object with:
                    - "name" — the move name, one of: "forward", "back", "right", "left", "jump",
                    "sprint", "sneak", "swim", "turn", "look", "wave", "bow", "clap", "shake"
                    , "jump", "dance", "jump", "jump", "jump", "jump", "jump", "jump", "jump"
                    , "jump", "jump", "jump", "jump", "jump", "jump", "jump", "jump", "jump"
                    ${requirement}
                    Each step must be a JSON object with:
                    - "name" — the move name, one of: "forward", "back", "right", "left", "jump"
                    ,
                    "sprint", "sneak", "swing", "nod", "shake", "chat".
                    - "duration" — integer milliseconds for how long to perform the move (omit or
                    set to 0 if duration is not applicable).
                    The result should be formatted in **JSON** dictionary and enclosed in **triple
                    backticks (\` \`\`\` \` )** without labels like \"json\", \"css\", or \"data\"
                    .
                    - **Do not** generate redundant content other than the result in JSON form
                    at.
                    - **Do not** use triple backticks anywhere else in your answer.
                    Example format (not actual output):
                    \`\`\`
                    [
                    {"name": "forward", "duration": 1000},
                    {"name": "jump", "duration": 500},
                    {"name": "chat", "duration": 0}
                    ]
                    \`\`\`
                    `;
                    let [content, data] = await agent.plugin.plugins["remipriest"].callPrompter(prompt,true);
                    
                    const steps = JSON.parse(data);
                    // const steps = [;;
                    // {"name":"foward","duration":1000},
                    // {"name":"chat","duration":1000},
                    // {"name":"back","duration":1000},
                    // {"name":"foward","duration":1000},
                    // ]
                    for (let step of steps){
                        if (["foward","left","right","back","jump"].includes(step["name"])){
                            agent.bot.setControlState(step["name"],true);
                            await new Promise(resolve => setTimeout(resolve, step["duration"]));
                            agent.bot.setControlState(step["name"],false);
                        }else if(step["name"]=="chat"){
                            agent.bot.chat("I am happy");
                        }else if(step["name"]=="shake_head"){
                            agent.bot.look(
                                agent.bot.entity.yaw-1,
                                agent.bot.entity.pitch,
                                true
                            );
                            await new Promise(resolve => setTimeout(resolve, step["duration"]));
                            agent.bot.look(
                                agent.bot.entity.yaw+0.5,
                                agent.bot.entity.pitch,
                                true
                            );
                            await new Promise(resolve => setTimeout(resolve, step["duration"]));
                            agent.bot.look(
                                agent.bot.entity.yaw-1,
                                agent.bot.entity.pitch,
                                true
                            )
                        await new Promise(resolve => setTimeout(resolve, step["duration"]));
                            agent.bot.look(
                                agent.bot.entity.yaw+0.5,
                                agent.bot.entity.pitch,
                                true
                            )
                        }
                    }
                    agent.bot.chat("/weather rain");
                }
            }]
    }
}