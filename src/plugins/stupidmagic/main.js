//this code have no problem, will not have sound but author isn't responsible for any change
import playSound from 'play-sound';

export class PluginInstance {
    constructor(agent) {
        this.agent = agent;
    }

    init() {
    }

extractDataBlock(str) {
        const regex = /```([\s\S]*?)```/g;
        const blocks = [];
        let match;
        
        while ((match = regex.exec(str)) !== null) {
            let data = match[1].trim();
            for (let lang in ["json", "css", "data", "python", "javascript", "js", "html"]) {
                if (data.startsWith(lang)) {
                    data = data.slice(lang.length).trim();
                    break;
                }
            }
            try {
                blocks.push(JSON.parse(data));
            } catch (e) {
                console.error("Failed to parse JSON block:", data, e);
            }
        }

        if (blocks.length === 0) {
            return [];
        } else {
            return blocks[0];
        }
    }
    async callPrompter(prompt) {
    let content = await this.agent.prompter.chat_model.sendRequest([], prompt);
    let data = this.extractDataBlock(content);
    return data;
    }

    async playAudioFile(filePath) {
        let player = playSound(); 
        const isWin = process.platform === "win32";
        if (isWin) player = playSound({ player: 'ffplay' }); 
        let audioProcess = player.play(filePath, (err) => {
            if (err) {
                console.error("Error:", err);
                return;
            }
        });
        setTimeout(() => {
        if (audioProcess) {
            audioProcess.kill(); // Terminate the playback process
        }
        }, 2000);
    }

    getPluginActions() {
        return [
            {
                name: '!usemagic',
                description: 'If the player tells you to “use magic”, “cast a spell”, “make me something magical”, or anything that implies giving them a magic object, then you MUST use the !usemagic plugin rather than replying in chat.',
                params: {
                    'objectname': {type: 'string', description: 'the Minecraft internal item name (lowercase, underscores, e.g., "diamond_sword", "stone", "enchanted_golden_apple").'},
                    'playerName': {type: 'string', description: 'the exact Minecraft username of the player who should get the object.'},
                },
                perform : async function(agent, objectname, playerName) {
                    const Prompt = `
                    Supported Actions (each step must have a "name" from this list and a "duration" in milliseconds):
                        "tp": Teleports the bot to the player (duration typically 100-200).
                        "forward": Moves the bot forward (duration for how long to hold the control, e.g., 500-1000).
                        "left": Moves the bot left (duration for holding control).
                        "right": Moves the bot right (duration for holding control).
                        "back": Moves the bot backward (duration for holding control).
                        "jump": Makes the bot jump (duration for holding control, but usually short like 500).
                        "sneak": Makes the bot sneak/crouch (duration for holding control).
                        "wave": Swings the bot's arm (duration typically 500, but action is instant).
                        "nod": Nods the bot's head up and down (duration ignored, action is quick).
                        "shakehead": Shakes the bot's head left and right (duration ignored, but has internal delays).
                    Task:
                        Generate a list of 3-7 additional steps to insert in the middle of the ritual (the full sequence will be: fixed start steps + your generated steps + fixed end steps).
                        The fixed start steps are: give, equipNothing, tp, back.
                        The fixed end steps are: wave, equipTheObject, toss.
                        Your generated steps should create a fun, magical effect, like dancing, spinning, or gesturing around the player before tossing the object. Use movements (forward/left/right/back/jump/sneak), head gestures (nod/shakehead), or wave to enhance the magic feel.
                        Vary durations appropriately (e.g., movements 1000-5000ms, DURATION SHOULD BE NOT LESS THAT 500ms).
                        you don't need to use all of it, your movement should be like what a magician will do.

                    Example format (not actual output):
                    \`\`\`
                    [{"name":"forward", "duration":1000},
                    {“name":"jump", "duration":500},
                    {"name":"chat", "duration":0}
                    ]
                    \`\`\`
                    `
                    agent.bot.chat("OJBK");
                    let genratedSteps = await agent.plugin.plugins["stupidmagic"].callPrompter(Prompt)
                    console.log(genratedSteps)
                    const steps = [
                        //{"name":"magictrick","duration":1500},
                        {"name":"give","duration":1000},
                        {"name":"equipNothing","duration":1000},
                        {"name":"tp","duration":1000},
                        {"name":"back","duration":1000}].concat(genratedSteps).concat([{"name":"wave","duration":1000},
                        {"name":"equipTheObject","duration":2000},
                        {"name":"toss","duration":0}]);
                    console.log(steps)
                    for(let step of steps){
                        console.log(step)
                        if(step["name"]==='give'){
                            agent.bot.chat("/give "+agent.bot.username+" "+objectname);
                        }
                        if(step["name"]==='tp'){
                            agent.bot.chat("/tp "+agent.bot.username+" "+playerName);
                        }
                        if(["forward", "left", "right", "back", "jump", "sneak"].includes(step["name"])){
                            agent.bot.setControlState(step["name"], true);
                            await new Promise ((resolve)=>setTimeout (resolve, step["duration"]));
                            agent.bot.setControlState(step["name"], false);
                        }
                        if(step["name"]==='equipNothing'){
                            let fromSlot = agent.bot.inventory.hotbarStart + agent.bot.quickBarSlot;
                            let emptySlot = agent.bot.inventory.slots.findIndex((slot, index) => index >= 9 && index <= 35 && slot == null);
                            await agent.bot.moveSlotItem(fromSlot, emptySlot);
                        }
                        if(step["name"]==='wave'){
                            agent.bot.swingArm("right");
                        }
                        if(step["name"]==='equipTheObject'){
                            let item = agent.bot.inventory.items().find(i => i.name === objectname);
                            if (item) {
                            await agent.bot.equip(item, 'hand');
                            }
                        
                        }
                        if(step["name"]==='toss'){
                            
                            await agent.bot.toss(agent.bot.heldItem.type, null, agent.bot.heldItem.count);
                            
                        }
                        if(step["name"] ==="nod"){
                            agent.bot.look(20, 0, false);
                            agent.bot.look(-20,0, false);
                            agent.bot.look(0, 0, false);}
                        if(step["name"]==="shakehead"){
                            const originalYaw = agent.bot.entity.yaw;
                            await agent.bot.look(originalYaw + 45, agent.bot.entity.pitch, true);
                            await new Promise(resolve => setTimeout(resolve, 1000))
                            await agent.bot.look(originalYaw - 45, agent.bot.entity.pitch, true);
                            await new Promise(resolve => setTimeout(resolve, step["duration"]));
                        }   
                        if(step["name"]==="magictrick"){
                            agent.plugin.plugins["stupidmagic"].playAudioFile('./src/plugins/stupidmagic/');
                            agent.bot.setControlState('jump', true);
                            agent.bot.swingArm('right');
                            agent.bot.swingArm('left');
                            await new Promise(resolve => setTimeout(resolve, 100));
                            agent.bot.setControlState('jump',false);
                            await new Promise(resolve => setTimeout(resolve, 1400));
X
                        }
                        

                    }
                }
            }
        ]   
    }
}