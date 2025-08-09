
import { readdirSync, readFileSync, existsSync } from 'fs';
import * as skills from '../../agent/library/skills.js';
import * as world from '../../agent/library/world.js';
import * as mc from '../../utils/mcdata.js';
import { executeCommand } from '../../agent/commands/index.js';
import settings from '../../../settings.js';

export class Task {
    constructor(agent, configs) {
        this.agent = agent;
        this.configs = configs;
        this.timeout = 300;
        this.start_time = Date.now();
    }
    
    async execute() {
    }
}

export class PluginInstance {
    constructor(agent) {
        this.agent = agent;
        this.available_agents = [];
        this.plans = {}
        this.task = null;
        this.goal = null;
    }

    init() {
        try {
            const dir = 'src/plugins/Task/plans/';
            for (let file of readdirSync(dir)) {
                if (file.endsWith('.json') && !file.startsWith('.')) {
                    this.plans[file.slice(0, -5)] = JSON.parse(readFileSync(join(dir, file), 'utf8'));
                }
            }
        } catch (e) {
            console.log('Error reading plan files:', e);
        }

        try {
            const path = `bots/${this.agent.name}/task.json`;
            if (existsSync(this.path)) {
                const taskConfigs = JSON.parse(readFileSync(path, 'utf8'));
                this.task = Task(this.agent, taskConfigs);
            }
        } catch (e) {
            console.log('Error reading task file:', e);
        }
        
        try {
            for (let file of settings.profiles) {
                let profile = JSON.parse(readFileSync(file, 'utf8'));
                if (profile.name !== this.agent.name) {
                    this.available_agents.push(profile.name);
                }
            }
        } catch (e) {
            console.log('Error reading bot profiles:', e);
        }

        this.agent.bot.on('idle', async () => {
            if (!this.agent.isIdle() || this.task === null) return;
            await new Promise((resolve) => setTimeout(resolve, 5000));
            if (!this.agent.actions.resume_func) {
                await this.executeTask();
                this.agent.history.save();
            }
        });
    }

    async executeTask() {
        if (this.task) {
            console.log(`Execute the predefined task: ${this.task.configs}`);
            this.task.execute();
        } else {
            console.log("Predefined task is null. Nothing to execute.");
        }
    }

    async newTask(task_name, requirement, collaborate = false) {
        console.log(`Get a new task: task_name = ${task_name}, requirement = ${requirement}, collaborate = ${collaborate}.`);
        this.goal = requirement;
        
        if (task_name == "cooking") {
            this.goal += "\n\nFor cooking tasks: First gather all necessary ingredients. Use furnaces, smokers, or campfires as appropriate for the recipe. Ensure you have fuel for cooking. Check your recipe book for crafting recipes if needed.";
        } else if (task_name == "crafting") {
            this.goal += "\n\nFor crafting tasks: Gather all required materials and tools. Use the appropriate crafting station (crafting table, anvil, enchanting table, etc.). Follow the correct recipe pattern. Ensure you have enough materials for the desired quantity.";
        } else if (task_name == "construction") {
            this.goal += "\n\nFor construction tasks: Plan the build layout first. Gather all necessary building materials and tools. Start with the foundation and work systematically. Consider lighting, accessibility, and structural integrity. Use scaffolding if building tall structures.";
        } 
        
        if (collaborate) {
            if (this.available_agents.length > 0) {
                this.goal += "\n\nYou must collaborate with other players: " + this.available_agents.join(', ') + ". IMPORTANT: Before starting any work, communicate with your teammates to create a clear plan. Discuss what materials and resources are needed, then divide responsibilities - decide who will gather which materials, who will handle which parts of the task, and establish a timeline. Once everyone agrees on the plan and their assigned roles, execute your part while coordinating with others to ensure efficient completion. Use chat to share progress updates and coordinate handoffs between team members.";
            } else {
                console.log(`There are not enough AI characters to collaborate for task: task_name = ${task_name}, requirement = ${requirement}, collaborate = ${collaborate}.`);
            }
        }
        
        console.log(`Execute task goal: ${this.goal}.`);
        await executeCommand(this.agent, `!goal("${this.goal}")`);
        this.goal = null;
    }

    getPluginActions() {
        return [
            {
                name: '!executeTask',
                description: `Execute the predefined task, only if its status is 'true', which means the predefined task is not null. Status of the predefined task: ${this.task !== null}`,
                params: {},
                perform: async function (agent) {
                    await agent.plugin.plugins["Task"].executeTask();
                }
            },
            {
                name: '!newTask',
                description: 'Start a new task with the given name and requirements',
                params: {
                    'task_name': { type: 'string', description: 'name of the task to perform, which should be one of the options ["cooking", "crafting", "construction"].' },
                    'requirement': { type: 'string', description: 'a string that describes the requirement of the task in natural language.' },
                    'collaborate': { type: 'boolean', description: 'indicate whether the bot should try to collaborate in executing the task.' },
                },
                perform: async function (agent, task_name, requirement, collaborate) {
                    await agent.plugin.plugins["Task"].newTask(task_name, requirement, collaborate);
                }
            },
        ]
    }
}