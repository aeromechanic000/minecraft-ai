import { readdirSync, readFileSync } from 'fs';
import { NPCData } from './data.js';
import { ItemGoal } from './item_goal.js';
import { BuildGoal } from './build_goal.js';
import * as skills from '../../agent/library/skills.js';
import * as world from '../../agent/library/world.js';
import * as mc from '../../utils/mcdata.js';
import { itemSatisfied, rotateXZ } from '../../utils/build.js';

export class PluginInstance {
    constructor(agent) {
        this.agent = agent;
        this.data = NPCData.fromObject(agent.prompter.profile.npc);
        this.temp_goals = [];
        this.item_goal = new ItemGoal(agent, this.data);
        this.build_goal = new BuildGoal(agent);
        this.constructions = {};
        this.last_goals = {};
    }

    init() {
        try {
            let dir = 'src/plugins/NPC/construction/';
            for (let file of readdirSync(dir)) {
                if (file.endsWith('.json')) {
                    this.constructions[file.slice(0, -5)] = JSON.parse(readFileSync(dir + file, 'utf8'));
                }
            }
        } catch (e) {
            console.log('Error reading construction file');
        }

        for (let name in this.constructions) {
            let sizez = this.constructions[name].blocks[0].length;
            let sizex = this.constructions[name].blocks[0][0].length;
            let max_size = Math.max(sizex, sizez);
            for (let y = 0; y < this.constructions[name].blocks.length; y++) {
                for (let z = 0; z < max_size; z++) {
                    if (z >= this.constructions[name].blocks[y].length)
                        this.constructions[name].blocks[y].push([]);
                    for (let x = 0; x < max_size; x++) {
                        if (x >= this.constructions[name].blocks[y][z].length)
                            this.constructions[name].blocks[y][z].push('');
                    }
                }
            }
        }

        this.agent.bot.on('idle', async () => {
            if (this.data.goals.length === 0 && !this.data.curr_goal) return;
            // Wait a while for inputs before acting independently
            await new Promise((resolve) => setTimeout(resolve, 5000));
            if (!this.agent.isIdle()) return;

            // Persue goal
            if (!this.agent.actions.resume_func) {
                this.executeNext();
                this.agent.history.save();
            }
        });
    }

    getPluginActions() {
        return [];
    }

    getBuiltPositions() {
        let positions = [];
        for (let name in this.data.built) {
            let position = this.data.built[name].position;
            let offset = this.constructions[name].offset;
            let sizex = this.constructions[name].blocks[0][0].length;
            let sizez = this.constructions[name].blocks[0].length;
            let sizey = this.constructions[name].blocks.length;
            for (let y = offset; y < sizey+offset; y++) {
                for (let z = 0; z < sizez; z++) {
                    for (let x = 0; x < sizex; x++) {
                        positions.push({x: position.x + x, y: position.y + y, z: position.z + z});
                    }
                }
            }
        }
        return positions;
    }
    async setGoal(name=null, quantity=1) {
        this.data.curr_goal = null;
        this.last_goals = {};
        if (name) {
            this.data.curr_goal = {name: name, quantity: quantity};
            return;
        }

        if (!this.data.do_set_goal) return;

        let past_goals = {...this.last_goals};
        for (let goal in this.data.goals) {
            if (past_goals[goal.name] === undefined) past_goals[goal.name] = true;
        }
        let res = await this.promptGoalSetting(this.agent.history.getHistory(), past_goals);
        if (res) {
            this.data.curr_goal = res;
            console.log('Set new goal: ', res.name, ' x', res.quantity);
        } else {
            console.log('Error setting new goal.');
        }
    }
    
    async promptGoalSetting(messages, last_goals) {
        let system_message = ""; 
        system_message = await this.agent.prompter.replaceStrings(system_message, messages);

        let user_message = 'Use the below info to determine what goal to target next\n\n';
        user_message += '$LAST_GOALS\n$STATS\n$INVENTORY\n$CONVO'
        user_message = await this.agent.prompter.replaceStrings(user_message, messages, null, null, last_goals);
        let user_messages = [{role: 'user', content: user_message}];

        let res = await this.agent.prompter.enhancer.sendRequest(this.agent.prompter.chat_model, user_messages, system_message);

        let goal = null;
        try {
            let data = res.split('```')[1].replace('json', '').trim();
            goal = JSON.parse(data);
        } catch (err) {
            console.log('Failed to parse goal:', res, err);
        }
        if (!goal || !goal.name || !goal.quantity || isNaN(parseInt(goal.quantity))) {
            console.log('Failed to set goal:', res);
            return null;
        }
        goal.quantity = parseInt(goal.quantity);
        return goal;
    }

    async executeNext() {
        if (!this.agent.isIdle()) return;
        await this.agent.actions.runAction('npc:moveAway', async () => {
            await skills.moveAway(this.agent.bot, 2);
        });

        if (!this.data.do_routine || this.agent.bot.time.timeOfDay < 13000) { 
            // Exit any buildings
            let building = this.currentBuilding();
            if (building == this.data.home) {
                let door_pos = this.getBuildingDoor(building);
                if (door_pos) {
                    await this.agent.actions.runAction('npc:exitBuilding', async () => {
                        await skills.useDoor(this.agent.bot, door_pos);
                        await skills.moveAway(this.agent.bot, 2); // If the bot is too close to the building it will try to enter again
                    });
                }
            }

            // Work towards goals
            await this.executeGoal();

        } else {
            // Reset goal at the end of the day
            this.data.curr_goal = null;

            // Return to home
            let building = this.currentBuilding();
            if (this.data.home !== null && (building === null || building != this.data.home)) {
                let door_pos = this.getBuildingDoor(this.data.home);
                await this.agent.actions.runAction('npc:returnHome', async () => {
                    await skills.useDoor(this.agent.bot, door_pos);
                });
            }

            // Go to bed
            await this.agent.actions.runAction('npc:bed', async () => {
                await skills.goToBed(this.agent.bot);
            });
        }

        if (this.agent.isIdle())
            this.agent.bot.emit('idle');
    }

    async executeGoal() {
        // If we need more blocks to complete a building, get those first
        let goals = this.temp_goals.concat(this.data.goals);
        if (this.data.curr_goal)
            goals = goals.concat([this.data.curr_goal])
        this.temp_goals = [];

        let acted = false;
        for (let goal of goals) {
            // Obtain goal item or block
            if (this.constructions[goal.name] === undefined) {
                if (this.agent.bot.game.gameMode === "creative") 
                    this.agent.bot.chat(`/give ${this.agent.name} ${goal.name} ${goal.quantity}`)
                if (!itemSatisfied(this.agent.bot, goal.name, goal.quantity)) {
                    let res = await this.item_goal.executeNext(goal.name, goal.quantity);
                    this.last_goals[goal.name] = res;
                    acted = true;
                    break;
                }
            }
            // Build construction goal
            else {
                let res = null;
                if (this.data.built.hasOwnProperty(goal.name)) {
                    res = await this.build_goal.executeNext(
                        this.constructions[goal.name],
                        this.data.built[goal.name].position,
                        this.data.built[goal.name].orientation
                    );
                } else {
                    res = await this.build_goal.executeNext(this.constructions[goal.name]);
                    this.data.built[goal.name] = {
                        name: goal.name,
                        position: res.position,
                        orientation: res.orientation
                    };
                }
                if (Object.keys(res.missing).length === 0) {
                    this.data.home = goal.name;
                }
                for (let block_name in res.missing) {
                    this.temp_goals.push({
                        name: block_name,
                        quantity: res.missing[block_name]
                    })
                }
                if (res.acted) {
                    acted = true;
                    this.last_goals[goal.name] = Object.keys(res.missing).length === 0;
                    break;
                }
            }
        }

        if (!acted && this.data.do_set_goal)
            await this.setGoal();
    }

    currentBuilding() {
        let bot_pos = this.agent.bot.entity.position;
        for (let name in this.data.built) {
            let pos = this.data.built[name].position;
            let offset = this.constructions[name].offset;
            let sizex = this.constructions[name].blocks[0][0].length;
            let sizez = this.constructions[name].blocks[0].length;
            let sizey = this.constructions[name].blocks.length;
            if (this.data.built[name].orientation % 2 === 1) [sizex, sizez] = [sizez, sizex];
            if (bot_pos.x >= pos.x && bot_pos.x < pos.x + sizex &&
                bot_pos.y >= pos.y + offset && bot_pos.y < pos.y + sizey + offset &&
                bot_pos.z >= pos.z && bot_pos.z < pos.z + sizez) {
                return name;
            }
        }
        return null;
    }

    getBuildingDoor(name) {
        if (name === null || this.data.built[name] === undefined) return null;
        let door_x = null;
        let door_z = null;
        let door_y = null;
        for (let y = 0; y < this.constructions[name].blocks.length; y++) {
            for (let z = 0; z < this.constructions[name].blocks[y].length; z++) {
                for (let x = 0; x < this.constructions[name].blocks[y][z].length; x++) {
                    if (this.constructions[name].blocks[y][z][x] !== null &&
                        this.constructions[name].blocks[y][z][x].includes('door')) {
                        door_x = x;
                        door_z = z;
                        door_y = y;
                        break;
                    }
                }
                if (door_x !== null) break;
            }
            if (door_x !== null) break;
        }
        if (door_x === null) return null;

        let sizex = this.constructions[name].blocks[0][0].length;
        let sizez = this.constructions[name].blocks[0].length;
        let orientation = 4 - this.data.built[name].orientation; // this conversion is opposite
        if (orientation == 4) orientation = 0;
        [door_x, door_z] = rotateXZ(door_x, door_z, orientation, sizex, sizez);
        door_y += this.constructions[name].offset;

        return {
            x: this.data.built[name].position.x + door_x,
            y: this.data.built[name].position.y + door_y,
            z: this.data.built[name].position.z + door_z
        };
    }
}